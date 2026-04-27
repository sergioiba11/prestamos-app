export const normalizarNombreCompleto = (value: string) =>
  value.trim().replace(/\s+/g, ' ')

export const esNombreCompletoValido = (value: string) => {
  const limpio = normalizarNombreCompleto(value)
  return limpio.split(' ').filter(Boolean).length >= 2
}
