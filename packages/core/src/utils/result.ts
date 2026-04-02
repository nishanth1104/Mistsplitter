/**
 * Result<T, E> — discriminated union for explicit error handling.
 * Use ok() and err() constructors. Never throw for expected failures.
 */

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false
}

/**
 * Unwrap the value or throw. Only use in tests or when failure is truly unexpected.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value
  throw new Error(`Unwrap failed: ${JSON.stringify(result.error)}`)
}

/**
 * Map a Result<T, E> to Result<U, E> by applying f to the Ok value.
 */
export function mapOk<T, U, E>(result: Result<T, E>, f: (value: T) => U): Result<U, E> {
  if (result.ok) return ok(f(result.value))
  return result
}

/**
 * Map a Result<T, E> to Result<T, F> by applying f to the Err value.
 */
export function mapErr<T, E, F>(result: Result<T, E>, f: (error: E) => F): Result<T, F> {
  if (!result.ok) return err(f(result.error))
  return result
}
