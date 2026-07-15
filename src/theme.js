export const colors = {
  bg: '#12161a',
  panel: '#1a2027',
  border: '#2a323b',
  ink: '#eef1f4',
  muted: '#8d99a6',
  hydrant: '#e0392c',
  hydrantStrong: '#ff5142',
  youAreHere: '#3d8bfd',
  detailFull: '#22c55e',
  detailPartial: '#eab308',
  typeUnderground: '#8b5cf6'
};

export function detailColor(completeness) {
  if (completeness === 'full') return colors.detailFull;
  if (completeness === 'partial') return colors.detailPartial;
  return colors.hydrant;
}

export function typeMarkerColor(type) {
  if (type === 'underground') return colors.typeUnderground;
  if (type === 'aboveground') return colors.hydrant;
  return colors.muted;
}

export const LEGENDS = {
  detail: {
    title: 'HYDRANT DETAIL ON FILE',
    rows: [
      [colors.detailFull, 'Diameter & couplings known'],
      [colors.detailPartial, 'One of the two known'],
      [colors.hydrant, 'Neither recorded']
    ]
  },
  type: {
    title: 'HYDRANT TYPE',
    rows: [
      [colors.hydrant, 'Above ground (pillar/wall)'],
      [colors.typeUnderground, 'Underground'],
      [colors.muted, 'Type not recorded']
    ]
  }
};
