import antfu from '@antfu/eslint-config'
import merge from 'ts-deepmerge'
import maninakEslintConfig from './maninak-config.js'

const [maninakOptions, ...maninakConfig] = maninakEslintConfig

/**
 * Construct an array of ESLint flat config items.
 * @param {Parameters<typeof antfu>['0']} [options]
 * @param {...(Parameters<typeof antfu>['1'])} userConfigs
 */
export async function maninak(options = {}, ...userConfigs) {
  return await antfu(merge(maninakOptions, options), combine(...maninakConfig, ...userConfigs))
}

/**
 * Combine array and non-array configs into a single array.
 * @param {...(Parameters<typeof antfu>['1'])} configs
 */
function combine(...configs) {
  return configs.flat()
}
