import { __ } from '@editor/i18n';

/**
 * Texts of the built-in effect modules. The schema (schemas/effects/*.json) carries English titles,
 * descriptions and enum values; this table gives them to the translation tooling as literal `__()`
 * calls (npm run i18n:check) and translates them for the editor. Texts of add-on effects that are
 * not listed here are shown as delivered.
 */
const BUILT_IN: ReadonlyArray<readonly [string, string]> = [
  ['Additive', __('Additive')],
  ['Amount', __('Amount')],
  ['Appearance', __('Appearance')],
  ['Assembled', __('Assembled')],
  ['Attract', __('Attract')],
  ['Axis (x, y, z)', __('Axis (x, y, z)')],
  ['Blending', __('Blending')],
  ['Bounce', __('Bounce')],
  ['Boundary', __('Boundary')],
  ['Box', __('Box')],
  ['Whole area', __('Whole area')],
  ['By brightness', __('By brightness')],
  ['By darkness', __('By darkness')],
  ['Camera', __('Camera')],
  ['Centre (x, y, z)', __('Centre (x, y, z)')],
  ['Change speed', __('Change speed')],
  ['Colour', __('Colour')],
  ['Colour boost', __('Colour boost')],
  ['Colour from', __('Colour from')],
  ['Contain', __('Contain')],
  ['Cover', __('Cover')],
  ['Damping', __('Damping')],
  ['Depth fade', __('Depth fade')],
  ['Detail', __('Detail')],
  ['Direction', __('Direction')],
  ['Disc', __('Disc')],
  ['Distance', __('Distance')],
  ['Distribution', __('Distribution')],
  ['Drag', __('Drag')],
  ['Embers', __('Embers')],
  ['Emitter', __('Emitter')],
  ['Field of view (°)', __('Field of view (°)')],
  ['Fit', __('Fit')],
  ['Flow field', __('Flow field')],
  ['Forces and behaviour', __('Forces and behaviour')],
  [
    'GPU-simulated particles: shapes, flows, vortices and pointer forces; can rebuild a picture.',
    __(
      'GPU-simulated particles: shapes, flows, vortices and pointer forces; can rebuild a picture.',
    ),
  ],
  ['Glow', __('Glow')],
  ['Gravity wells', __('Gravity wells')],
  ['Image', __('Image')],
  ['Image to rebuild', __('Image to rebuild')],
  ['Initial velocity', __('Initial velocity')],
  ['Largest size (px)', __('Largest size (px)')],
  ['Lifecycle', __('Lifecycle')],
  ['Lifetime', __('Lifetime')],
  ['Line', __('Line')],
  ['Longest life (s)', __('Longest life (s)')],
  ['Magnet', __('Magnet')],
  ['Magnetic canvas', __('Magnetic canvas')],
  ['Mass (negative repels)', __('Mass (negative repels)')],
  ['Maximum force', __('Maximum force')],
  ['Maximum speed', __('Maximum speed')],
  ['Mode', __('Mode')],
  ['Movement boost', __('Movement boost')],
  ['None', __('None')],
  ['Normal', __('Normal')],
  ['Opacity', __('Opacity')],
  ['Orbit speed (rad/s)', __('Orbit speed (rad/s)')],
  ['Orbital mist', __('Orbital mist')],
  ['Orthographic', __('Orthographic')],
  ['Palette', __('Palette')],
  ['Coverage of the area', __('Coverage of the area')],
  ['Particle count', __('Particle count')],
  ['Particle field', __('Particle field')],
  ['Persistent', __('Persistent')],
  ['Perspective', __('Perspective')],
  ['Photo grains', __('Photo grains')],
  ['Pixel', __('Pixel')],
  ['Point', __('Point')],
  ['Pointer', __('Pointer')],
  ['Pointer effect', __('Pointer effect')],
  ['Polarity', __('Polarity')],
  ['Position (x, y, z)', __('Position (x, y, z)')],
  ['Projection', __('Projection')],
  ['Pull to axis', __('Pull to axis')],
  ['Radial', __('Radial')],
  [
    'Radial burst (trigger the impulse), then slowing down and gathering.',
    __('Radial burst (trigger the impulse), then slowing down and gathering.'),
  ],
  ['Radiant pulse', __('Radiant pulse')],
  ['Radius', __('Radius')],
  ['Random', __('Random')],
  ['Re-enter opposite side', __('Re-enter opposite side')],
  ['Rebuild the image from particles', __('Rebuild the image from particles')],
  ['Relief depth', __('Relief depth')],
  ['Repel', __('Repel')],
  ['Respawn', __('Respawn')],
  ['Return to origin', __('Return to origin')],
  ['Ring', __('Ring')],
  ['Scale', __('Scale')],
  ['Scatter, then assemble', __('Scatter, then assemble')],
  ['Second colour', __('Second colour')],
  ['Shape', __('Shape')],
  ['Shortest life (s)', __('Shortest life (s)')],
  ['Size (x, y, z)', __('Size (x, y, z)')],
  ['Smallest size (px)', __('Smallest size (px)')],
  ['Soft disc', __('Soft disc')],
  [
    'Soft, rotating particle swarm with a spherical silhouette.',
    __('Soft, rotating particle swarm with a spherical silhouette.'),
  ],
  ['Solid', __('Solid')],
  ['Spawn', __('Spawn')],
  ['Speed', __('Speed')],
  ['Speed limit', __('Speed limit')],
  ['Sphere surface', __('Sphere surface')],
  ['Sphere volume', __('Sphere volume')],
  ['Spiral flows around a central axis.', __('Spiral flows around a central axis.')],
  ['Start', __('Start')],
  ['Stiffness', __('Stiffness')],
  ['Strength', __('Strength')],
  ['Style', __('Style')],
  ['Swirl', __('Swirl')],
  ['Tangential', __('Tangential')],
  [
    'The picture builds from thousands of coloured points; the pointer whirls them up and they settle again. Choose a picture under "Media".',
    __(
      'The picture builds from thousands of coloured points; the pointer whirls them up and they settle again. Choose a picture under "Media".',
    ),
  ],
  [
    'The pointer pulls picture points out along curved field lines; they return. Choose a picture under "Media".',
    __(
      'The pointer pulls picture points out along curved field lines; they return. Choose a picture under "Media".',
    ),
  ],
  ['Tilt (rad)', __('Tilt (rad)')],
  ['Uniform', __('Uniform')],
  ['Vortex', __('Vortex')],
  ['Vortex ribbons', __('Vortex ribbons')],
  [
    'Warm particles rise with turbulence and fade out.',
    __('Warm particles rise with turbulence and fade out.'),
  ],
  ['Wells', __('Wells')],
  ['When leaving', __('When leaving')],
];

const TABLE = new Map<string, string>(BUILT_IN);

/** Translated title, description or enum label; unknown texts (add-ons) stay as they are. */
export function effectText(text: string): string {
  return TABLE.get(text) ?? text;
}

/** Whether the table knows a text (used by tests to keep schema and translations in step). */
export function hasEffectText(text: string): boolean {
  return TABLE.has(text);
}

/** Whether an enum value of the built-in modules has a display text. */
export function hasEnumLabel(value: string): boolean {
  return value in ENUM_EN && TABLE.has(ENUM_EN[value] ?? '');
}

/** English display text of an enum value of the built-in modules (before translation). */
const ENUM_EN: Readonly<Record<string, string>> = {
  point: 'Point',
  disc: 'Disc',
  ring: 'Ring',
  'sphere-surface': 'Sphere surface',
  'sphere-volume': 'Sphere volume',
  box: 'Box',
  line: 'Line',
  view: 'Whole area',
  none: 'None',
  radial: 'Radial',
  tangential: 'Tangential',
  random: 'Random',
  persistent: 'Persistent',
  emitter: 'Emitter',
  'soft-disc': 'Soft disc',
  glow: 'Glow',
  pixel: 'Pixel',
  solid: 'Solid',
  speed: 'Speed',
  life: 'Lifetime',
  palette: 'Palette',
  image: 'Image',
  additive: 'Additive',
  normal: 'Normal',
  perspective: 'Perspective',
  orthographic: 'Orthographic',
  repel: 'Repel',
  attract: 'Attract',
  swirl: 'Swirl',
  magnet: 'Magnet',
  contain: 'Contain',
  cover: 'Cover',
  uniform: 'Uniform',
  luminance: 'By brightness',
  'inverse-luminance': 'By darkness',
  rest: 'Assembled',
  scatter: 'Scatter, then assemble',
  wrap: 'Re-enter opposite side',
  bounce: 'Bounce',
  respawn: 'Respawn',
};

/** Label of an enum value: the built-in table, else a readable form of the raw value. */
export function enumLabel(value: string): string {
  const english = ENUM_EN[value];
  if (english) return effectText(english);
  return value.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
