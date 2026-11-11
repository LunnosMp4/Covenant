type OpenAIConstructor = (typeof import('openai'))['default']

/**
 * The OpenAI SDK is a large module (client + request/streaming/error plumbing)
 * and is not needed unless a chat, transcription or web-search call actually
 * runs. It used to be required by `registerIpc()` at startup, before the app
 * was even ready; resolve it on first use instead and keep it cached.
 */
let sdkPromise: Promise<OpenAIConstructor> | null = null

export function loadOpenAISdk(): Promise<OpenAIConstructor> {
  if (!sdkPromise) {
    sdkPromise = import('openai')
      // `default` is the class for both the CJS and ESM builds; fall back to the
      // namespace itself if a bundler hands us the bare export object.
      .then((module) => module.default ?? (module as unknown as OpenAIConstructor))
      .catch((error) => {
        // Don't cache a failed load; a later call can retry.
        sdkPromise = null
        throw error
      })
  }
  return sdkPromise
}
