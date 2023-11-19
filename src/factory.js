import antfu from '@antfu/eslint-config'
import merge from "ts-deepmerge";
import maninakEslintConfig from './maninak-config.js'

const [maninakOptions, ...maninakConfig] = maninakEslintConfig

/**
 * Construct an array of ESLint flat config items.
 * @param {import('@antfu/eslint-config').OptionsConfig & import('@antfu/eslint-config').ConfigItem} [options]
 * @param {...(import('@antfu/eslint-config').ConfigItem | import('@antfu/eslint-config').ConfigItem[])} userConfigs
 */
export function maninak(options = {}, ...userConfigs) {
  return antfu(merge(maninakOptions,options),

  combine(...maninakConfig, ...userConfigs))
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean} True if `item` is an object, otherwise false
 */
export function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Combine array and non-array configs into a single array.
 * @param {(import('@antfu/eslint-config').ConfigItem | import('@antfu/eslint-config').ConfigItem[])[]} configs
 * @returns {import('@antfu/eslint-config').ConfigItem[]} -
 */
export function combine(...configs) {
  return configs.flat()
}
