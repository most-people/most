import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  hasDebugRendererSymbol,
  repairIntelSimulatorReactNativeCore,
} from './ensure-ios-debug-rncore.mjs'

const DEBUG_SYMBOL =
  '__ZNK8facebook5react22DebugStringConvertible12getDebugNameEv'

describe('Intel iOS simulator React Native Core repair', () => {
  it('recognizes a Debug renderer binary', () => {
    assert.equal(hasDebugRendererSymbol(`0000 T ${DEBUG_SYMBOL}\n`), true)
    assert.equal(hasDebugRendererSymbol('0000 T _release_only_symbol\n'), false)
  })

  it('leaves a matching Debug Core unchanged', () => {
    let replacements = 0
    const status = repairIntelSimulatorReactNativeCore({
      binaryPath: '/tmp/React',
      markerPath: '/tmp/.last_build_configuration',
      scriptPath: '/tmp/replace-rncore-version.js',
      version: '0.86.2',
      podsRoot: '/tmp/Pods',
      inspect: () => true,
      replace: () => {
        replacements += 1
      },
    })

    assert.equal(status, 'ready')
    assert.equal(replacements, 0)
  })

  it('marks and replaces a stale Release Core', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-rncore-test-'))
    const markerPath = path.join(tempDir, '.last_build_configuration')
    const inspections = [false, true]
    let replacement

    const status = repairIntelSimulatorReactNativeCore({
      binaryPath: path.join(tempDir, 'React'),
      markerPath,
      scriptPath: '/react-native/replace-rncore-version.js',
      version: '0.86.2',
      podsRoot: tempDir,
      inspect: () => inspections.shift(),
      replace: options => {
        replacement = options
        assert.equal(fs.readFileSync(markerPath, 'utf8'), 'Release')
      },
    })

    assert.equal(status, 'repaired')
    assert.deepEqual(replacement, {
      scriptPath: '/react-native/replace-rncore-version.js',
      version: '0.86.2',
      podsRoot: tempDir,
    })
  })

  it('fails if the Debug Core still lacks renderer symbols', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-rncore-test-'))

    assert.throws(
      () =>
        repairIntelSimulatorReactNativeCore({
          binaryPath: path.join(tempDir, 'React'),
          markerPath: path.join(tempDir, '.last_build_configuration'),
          scriptPath: '/react-native/replace-rncore-version.js',
          version: '0.86.2',
          podsRoot: tempDir,
          inspect: () => false,
          replace: () => {},
        }),
      /still missing Intel renderer symbols/
    )
  })
})
