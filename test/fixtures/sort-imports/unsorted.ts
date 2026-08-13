/* Fixture for perfectionist/sort-imports custom groups.
 *
 * This is the layout a monorepo wants: `extensionUtils/` is an alias onto a sibling package,
 * so it belongs between external packages and `@/` project aliases. Without a custom group
 * the rule sees it as just another external package, where alphabetical order would put it
 * ahead of `some-package`, so this file reports. Adding the group makes the layout legal.
 */

import { join } from 'node:path'
import { external } from 'some-package'
import { helper } from 'extensionUtils/helper'
import { alias } from '@/alias'
import { sibling } from './sibling'

export const used = [join, external, helper, alias, sibling]
