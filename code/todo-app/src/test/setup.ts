import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { installMatchMedia } from './matchMedia.ts'

beforeEach(() => {
  localStorage.clear()
  installMatchMedia(false)
})

afterEach(() => {
  cleanup()
})
