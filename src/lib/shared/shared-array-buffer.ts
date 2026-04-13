export function hasSharedArrayBufferSupport() {
  return typeof SharedArrayBuffer !== 'undefined'
}

export function isSharedArrayBuffer(
  value: ArrayBufferLike | null | undefined
): value is SharedArrayBuffer {
  return hasSharedArrayBufferSupport() && value instanceof SharedArrayBuffer
}
