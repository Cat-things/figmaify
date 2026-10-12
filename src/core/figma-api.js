'use strict'

const API = 'https://api.figma.com'

// Figma caps how many ids fit in one render call, and long query strings
// get rejected anyway, so renders go out in batches.
const RENDER_BATCH = 50

class FigmaApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor (message, status) {
    super(message)
    this.name = 'FigmaApiError'
    this.status = status
  }
}

/**
 * @typedef {(url: string, init?: any) => Promise<Response>} FetchLike
 */

/**
 * @param {{ token: string, fetch?: FetchLike, baseUrl?: string, wait?: (ms: number) => Promise<void> }} opts
 */
function createClient (opts) {
  const fetchImpl = opts.fetch || globalThis.fetch
  const baseUrl = opts.baseUrl || API
  const wait = opts.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))

  /**
   * @param {string} path
   * @param {Record<string, string | number | undefined>} [params]
   */
  async function get (path, params = {}) {
    const url = new URL(path, baseUrl)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    for (let attempt = 0; ; attempt++) {
      let res
      try {
        res = await fetchImpl(url.toString(), { headers: { 'X-Figma-Token': opts.token } })
      } catch (err) {
        if (attempt < 2) {
          await wait(1000 * (attempt + 1))
          continue
        }
        throw new FigmaApiError('Couldn\'t reach Figma. Check your internet connection.', 0)
      }

      if (res.ok) return res.json()

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0
        // Short waits are worth sitting through. Long ones mean the monthly
        // or per minute budget is gone and the user should know.
        if (retryAfter > 0 && retryAfter <= 30 && attempt < 3) {
          await wait(retryAfter * 1000)
          continue
        }
        throw new FigmaApiError(rateLimitMessage(retryAfter), 429)
      }

      if (res.status >= 500 && attempt < 2) {
        await wait(1500 * (attempt + 1))
        continue
      }

      throw new FigmaApiError(await errorMessage(res), res.status)
    }
  }

  return {
    /**
     * Pages and the frames on them. depth 3 also reaches frames inside sections.
     * @param {string} fileKey
     */
    getFileOutline (fileKey) {
      return get(`/v1/files/${encodeURIComponent(fileKey)}`, { depth: 3 })
    },

    /**
     * Full node trees for the given ids.
     * @param {string} fileKey
     * @param {string[]} ids
     */
    getNodes (fileKey, ids) {
      return get(`/v1/files/${encodeURIComponent(fileKey)}/nodes`, { ids: ids.join(',') })
    },

    /**
     * Download URLs for every image fill in the file, keyed by imageRef.
     * @param {string} fileKey
     * @returns {Promise<Record<string, string>>}
     */
    async getImageFills (fileKey) {
      const body = await get(`/v1/files/${encodeURIComponent(fileKey)}/images`)
      return (body.meta && body.meta.images) || {}
    },

    /**
     * Ask Figma to render nodes. Returns node id to URL (or null when a render failed).
     * @param {string} fileKey
     * @param {string[]} ids
     * @param {{ format: 'svg' | 'png', scale?: number }} options
     * @returns {Promise<Record<string, string | null>>}
     */
    async renderNodes (fileKey, ids, options) {
      /** @type {Record<string, string | null>} */
      const out = {}
      for (let i = 0; i < ids.length; i += RENDER_BATCH) {
        const batch = ids.slice(i, i + RENDER_BATCH)
        const body = await get(`/v1/images/${encodeURIComponent(fileKey)}`, {
          ids: batch.join(','),
          format: options.format,
          scale: options.format === 'png' ? options.scale || 2 : undefined,
          svg_include_id: options.format === 'svg' ? 'false' : undefined,
          svg_simplify_stroke: options.format === 'svg' ? 'true' : undefined
        })
        if (body.err) throw new FigmaApiError(`Figma couldn't render some layers: ${body.err}`, 400)
        Object.assign(out, body.images || {})
      }
      return out
    }
  }
}

/** @param {number} seconds */
function rateLimitMessage (seconds) {
  if (!seconds) return 'Figma says you\'ve hit the API rate limit. Wait a bit and try again.'
  if (seconds < 120) return `Figma says you've hit the API rate limit. Try again in ${seconds} seconds.`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 120) return `Figma says you've hit the API rate limit. Try again in about ${minutes} minutes.`
  const hours = Math.ceil(minutes / 60)
  if (hours <= 48) return `Figma says you've hit the API rate limit. Try again in about ${hours} hours.`
  return 'Figma says you\'ve used up your API requests for now. View and Collab seats get very few requests per month, so a Dev or Full seat works much better.'
}

/** @param {Response} res */
async function errorMessage (res) {
  let detail = ''
  try {
    const body = await res.json()
    detail = body.err || body.message || ''
  } catch {}

  if (res.status === 403) {
    return 'Figma turned the token down. Make sure it\'s still valid, has the file_content:read scope, and that your account can open this file.'
  }
  if (res.status === 404) {
    return 'Figma couldn\'t find that file. Double check the link.'
  }
  return detail ? `Figma API error (${res.status}): ${detail}` : `Figma API error (${res.status}).`
}

module.exports = { createClient, FigmaApiError, RENDER_BATCH }
