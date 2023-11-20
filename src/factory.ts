import antfu, { combine } from '@antfu/eslint-config'
import merge from 'ts-deepmerge'
import maninakEslintConfig from './config.js'

const [maninakOptions, ...maninakConfig] = maninakEslintConfig

/**
 * Construct an array of ESLint flat config items.
 */
export async function maninak(
  options: Parameters<typeof antfu>['0'] = {},
  ...userConfigs: Parameters<typeof antfu>['1'][]
) {
  return await antfu(merge(maninakOptions, options), combine(...maninakConfig, ...userConfigs))
}
