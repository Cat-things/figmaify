'use strict'

// A small hand made file in the shape the Figma REST API returns:
// a sign in screen, a dashboard and a settings dialog wired together
// with prototype links.

const rgb = (hex, a = 1) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  a
})
const solid = (hex, opacity) => ({ type: 'SOLID', color: rgb(hex), ...(opacity === undefined ? {} : { opacity }) })
const box = (x, y, width, height) => ({ x, y, width, height })

const text = (id, name, x, y, w, h, characters, style, extra = {}) => ({
  id,
  name,
  type: 'TEXT',
  absoluteBoundingBox: box(x, y, w, h),
  constraints: { horizontal: 'LEFT', vertical: 'TOP' },
  characters,
  style: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 14,
    textAlignHorizontal: 'LEFT',
    textAlignVertical: 'TOP',
    lineHeightUnit: 'INTRINSIC_%',
    textAutoResize: 'WIDTH_AND_HEIGHT',
    ...style
  },
  fills: [solid('#111827')],
  ...extra
})

const signIn = {
  id: '1:2',
  name: 'Sign in',
  type: 'FRAME',
  absoluteBoundingBox: box(0, 0, 1200, 760),
  clipsContent: true,
  fills: [solid('#F4F5F7')],
  children: [
    {
      id: '1:3',
      name: 'Hero',
      type: 'RECTANGLE',
      absoluteBoundingBox: box(0, 0, 520, 760),
      constraints: { horizontal: 'LEFT', vertical: 'TOP_BOTTOM' },
      fills: [{ type: 'IMAGE', imageRef: 'hero-ref', scaleMode: 'FILL' }]
    },
    {
      id: '1:4',
      name: 'Title bar @drag',
      type: 'FRAME',
      absoluteBoundingBox: box(0, 0, 1200, 36),
      constraints: { horizontal: 'LEFT_RIGHT', vertical: 'TOP' },
      fills: [],
      children: [
        {
          id: '1:5',
          name: 'Close @close',
          type: 'FRAME',
          absoluteBoundingBox: box(1154, 0, 46, 36),
          constraints: { horizontal: 'RIGHT', vertical: 'TOP' },
          fills: [],
          children: [
            {
              id: '1:6',
              name: 'x',
              type: 'VECTOR',
              absoluteBoundingBox: box(1171, 12, 12, 12),
              absoluteRenderBounds: box(1170, 11, 14, 14),
              constraints: { horizontal: 'CENTER', vertical: 'CENTER' },
              strokes: [solid('#111827')],
              strokeWeight: 1.5
            }
          ]
        }
      ]
    },
    {
      id: '1:7',
      name: 'Card',
      type: 'FRAME',
      absoluteBoundingBox: box(710, 170, 380, 420),
      constraints: { horizontal: 'CENTER', vertical: 'CENTER' },
      layoutMode: 'VERTICAL',
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'FIXED',
      itemSpacing: 14,
      paddingTop: 32,
      paddingRight: 32,
      paddingBottom: 32,
      paddingLeft: 32,
      cornerRadius: 12,
      fills: [solid('#FFFFFF')],
      strokes: [solid('#E2E4E9')],
      strokeWeight: 1,
      strokeAlign: 'INSIDE',
      effects: [{ type: 'DROP_SHADOW', visible: true, color: rgb('#000000', 0.08), offset: { x: 0, y: 8 }, radius: 24, spread: 0 }],
      children: [
        text('1:8', 'Welcome back', 742, 202, 210, 34, 'Welcome back', { fontWeight: 700, fontSize: 28 }),
        text('1:9', 'Subtitle', 742, 250, 160, 17, 'Sign in to keep going', {}, { fills: [solid('#6B7280')] }),
        {
          id: '1:10',
          name: 'Email @input',
          type: 'FRAME',
          absoluteBoundingBox: box(742, 281, 316, 44),
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          cornerRadius: 8,
          fills: [solid('#FFFFFF')],
          strokes: [solid('#D1D5DB')],
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          children: [
            text('1:11', 'Placeholder', 756, 294, 120, 17, 'you@example.com', {}, { fills: [solid('#9CA3AF')] })
          ]
        },
        {
          id: '1:12',
          name: 'Password @password',
          type: 'FRAME',
          absoluteBoundingBox: box(742, 339, 316, 44),
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          cornerRadius: 8,
          fills: [solid('#FFFFFF')],
          strokes: [solid('#D1D5DB')],
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          children: [
            text('1:13', 'Placeholder', 756, 352, 70, 17, 'Password', {}, { fills: [solid('#9CA3AF')] })
          ]
        },
        {
          id: '1:14',
          name: 'Button',
          type: 'INSTANCE',
          absoluteBoundingBox: box(742, 397, 316, 44),
          layoutMode: 'HORIZONTAL',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          cornerRadius: 8,
          fills: [solid('#4F46E5')],
          interactions: [{
            trigger: { type: 'ON_CLICK' },
            actions: [{ type: 'NODE', destinationId: '2:1', navigation: 'NAVIGATE', transition: { type: 'DISSOLVE', duration: 0.3, easing: { type: 'EASE_OUT' } } }]
          }],
          children: [
            text('1:15', 'Label', 874, 410, 52, 18, 'Sign in', { fontWeight: 600, fontSize: 15 }, { fills: [solid('#FFFFFF')] })
          ]
        },
        text('1:16', 'Footer', 742, 455, 180, 17, 'No account? Create one', {}, {
          fills: [solid('#6B7280')],
          characterStyleOverrides: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
          styleOverrideTable: {
            1: { fontWeight: 600, fills: [solid('#4F46E5')], hyperlink: { type: 'URL', url: 'https://example.com/signup' } }
          }
        })
      ]
    },
    {
      id: '1:17',
      name: 'Hidden note',
      type: 'TEXT',
      visible: false,
      absoluteBoundingBox: box(20, 700, 100, 20),
      characters: 'remove me',
      style: { fontFamily: 'Inter', fontSize: 12 },
      fills: [solid('#000000')]
    }
  ]
}

const dashboard = {
  id: '2:1',
  name: 'Dashboard',
  type: 'FRAME',
  absoluteBoundingBox: box(1300, 0, 1200, 760),
  clipsContent: true,
  fills: [solid('#FFFFFF')],
  children: [
    {
      id: '2:2',
      name: 'Sidebar',
      type: 'FRAME',
      absoluteBoundingBox: box(1300, 0, 240, 760),
      constraints: { horizontal: 'LEFT', vertical: 'TOP_BOTTOM' },
      layoutMode: 'VERTICAL',
      primaryAxisSizingMode: 'FIXED',
      counterAxisSizingMode: 'FIXED',
      itemSpacing: 6,
      paddingTop: 56,
      paddingLeft: 20,
      paddingRight: 20,
      fills: [solid('#111827')],
      children: [
        text('2:3', 'Overview', 1320, 56, 200, 36, 'Overview', { fontWeight: 600, textAutoResize: 'HEIGHT', lineHeightUnit: 'PIXELS', lineHeightPx: 36 }, {
          layoutSizingHorizontal: 'FILL',
          fills: [solid('#FFFFFF')]
        }),
        text('2:4', 'Projects', 1320, 98, 200, 36, 'Projects', { textAutoResize: 'HEIGHT', lineHeightUnit: 'PIXELS', lineHeightPx: 36 }, {
          layoutSizingHorizontal: 'FILL',
          fills: [solid('#9CA3AF')]
        }),
        text('2:5', 'Settings', 1320, 140, 200, 36, 'Settings', { textAutoResize: 'HEIGHT', lineHeightUnit: 'PIXELS', lineHeightPx: 36 }, {
          layoutSizingHorizontal: 'FILL',
          fills: [solid('#9CA3AF')],
          interactions: [{
            trigger: { type: 'ON_CLICK' },
            actions: [{ type: 'NODE', destinationId: '3:1', navigation: 'OVERLAY', transition: { type: 'MOVE_IN', direction: 'TOP', duration: 0.25 } }]
          }, {
            trigger: { type: 'ON_HOVER' },
            actions: [{ type: 'NODE', destinationId: '2:4', navigation: 'CHANGE_TO' }]
          }]
        })
      ]
    },
    text('2:6', 'Heading', 1580, 40, 160, 32, 'Overview', { fontWeight: 700, fontSize: 26 }),
    {
      id: '2:7',
      name: 'Star',
      type: 'STAR',
      absoluteBoundingBox: box(1750, 46, 20, 20),
      constraints: { horizontal: 'LEFT', vertical: 'TOP' },
      fills: [solid('#F59E0B')]
    },
    {
      id: '2:8',
      name: 'Stats',
      type: 'FRAME',
      absoluteBoundingBox: box(1580, 100, 880, 120),
      constraints: { horizontal: 'LEFT_RIGHT', vertical: 'TOP' },
      layoutMode: 'HORIZONTAL',
      primaryAxisSizingMode: 'FIXED',
      counterAxisSizingMode: 'FIXED',
      itemSpacing: 16,
      fills: [],
      children: ['Revenue', 'Users', 'Uptime'].map((label, i) => ({
        id: `2:${10 + i}`,
        name: label,
        type: 'FRAME',
        absoluteBoundingBox: box(1580 + i * 298.67, 100, 282.67, 120),
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FILL',
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        paddingTop: 18,
        paddingBottom: 18,
        paddingLeft: 20,
        paddingRight: 20,
        cornerRadius: 12,
        fills: [{
          type: 'GRADIENT_LINEAR',
          gradientHandlePositions: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
          gradientStops: [
            { color: rgb(['#6366F1', '#0EA5E9', '#10B981'][i]), position: 0 },
            { color: rgb(['#8B5CF6', '#22D3EE', '#84CC16'][i]), position: 1 }
          ]
        }],
        children: [
          text(`2:${20 + i}`, 'Label', 1600 + i * 298.67, 118, 80, 17, label, { fontWeight: 500 }, { fills: [solid('#FFFFFF', 0.85)] }),
          text(`2:${30 + i}`, 'Value', 1600 + i * 298.67, 168, 120, 34, ['$48.2k', '1,204', '99.9%'][i], { fontWeight: 700, fontSize: 28 }, { fills: [solid('#FFFFFF')] })
        ]
      }))
    },
    {
      id: '2:9',
      name: 'Avatar',
      type: 'ELLIPSE',
      absoluteBoundingBox: box(2436, 36, 40, 40),
      constraints: { horizontal: 'RIGHT', vertical: 'TOP' },
      fills: [{ type: 'IMAGE', imageRef: 'avatar-ref', scaleMode: 'FILL' }]
    },
    {
      id: '2:40',
      name: 'Badge',
      type: 'GROUP',
      absoluteBoundingBox: box(1580, 250, 120, 120),
      constraints: { horizontal: 'LEFT', vertical: 'TOP' },
      children: [
        { id: '2:41', name: 'Mask', type: 'ELLIPSE', isMask: true, absoluteBoundingBox: box(1580, 250, 120, 120), fills: [solid('#000000')] },
        { id: '2:42', name: 'Photo', type: 'RECTANGLE', absoluteBoundingBox: box(1560, 240, 160, 140), fills: [{ type: 'IMAGE', imageRef: 'hero-ref', scaleMode: 'FILL' }] }
      ]
    },
    text('2:50', 'Sign out', 2400, 712, 60, 17, 'Sign out', { fontWeight: 600 }, {
      constraints: { horizontal: 'RIGHT', vertical: 'BOTTOM' },
      fills: [solid('#4F46E5')],
      interactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] }]
    })
  ]
}

const settings = {
  id: '3:1',
  name: 'Settings dialog',
  type: 'FRAME',
  absoluteBoundingBox: box(2600, 0, 420, 240),
  clipsContent: true,
  cornerRadius: 16,
  fills: [solid('#FFFFFF')],
  overlayPositionType: 'CENTER',
  overlayBackground: { type: 'SOLID_COLOR', color: rgb('#0F172A', 0.45) },
  overlayBackgroundInteraction: 'CLOSE_ON_CLICK_OUTSIDE',
  effects: [{ type: 'DROP_SHADOW', visible: true, color: rgb('#000000', 0.2), offset: { x: 0, y: 20 }, radius: 40, spread: 0 }],
  children: [
    text('3:2', 'Title', 2628, 28, 140, 26, 'Settings', { fontWeight: 700, fontSize: 20 }),
    text('3:3', 'Body', 2628, 66, 364, 40, 'Nothing to change yet. This dialog is here to show overlays working.', { textAutoResize: 'HEIGHT' }, { fills: [solid('#4B5563')] }),
    {
      id: '3:4',
      name: 'Done',
      type: 'FRAME',
      absoluteBoundingBox: box(2900, 176, 92, 40),
      constraints: { horizontal: 'RIGHT', vertical: 'BOTTOM' },
      layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
      primaryAxisSizingMode: 'FIXED',
      counterAxisSizingMode: 'FIXED',
      cornerRadius: 8,
      fills: [solid('#111827')],
      interactions: [{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'CLOSE' }] }],
      children: [text('3:5', 'Label', 2930, 188, 32, 17, 'Done', { fontWeight: 600 }, { fills: [solid('#FFFFFF')] })]
    }
  ]
}

const file = {
  name: 'Sample app',
  version: '42',
  lastModified: '2026-10-01T10:00:00Z',
  editorType: 'figma',
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    children: [{
      id: '0:1',
      name: 'Screens',
      type: 'CANVAS',
      flowStartingPoints: [{ nodeId: '1:2', name: 'Flow 1' }],
      children: [
        { ...signIn, children: undefined },
        { ...dashboard, children: undefined },
        { id: '9:1', name: 'Dialogs', type: 'SECTION', absoluteBoundingBox: box(2560, -40, 500, 320), children: [{ ...settings, children: undefined }] }
      ]
    }]
  }
}

module.exports = { file, nodes: { '1:2': signIn, '2:1': dashboard, '3:1': settings } }
