<script setup lang="ts">
// Fixture: ordinary, fully-typed SFC code that leans only on built-in types, so nothing here
// depends on a resolvable `vue` package. Any type-aware finding is a template false positive,
// which is the risk that keeps vueTypeAware opt-in.
interface Item {
  id: number
  label: string
}

const items: Item[] = [{ id: 1, label: 'first' }]
const query = 'fir'
const count = items.length
const visible = items.filter((item) => item.label.includes(query))

function pick(item: Item): string {
  return item.label
}

function describe(item: Item): string {
  return `${item.label} (${item.id})`
}
</script>

<template>
  <div>
    <p>{{ count }} of {{ items.length }}</p>
    <p>{{ query }}</p>
    <ul>
      <li v-for="item in visible" :key="item.id" :title="pick(item)">
        {{ describe(item) }}
      </li>
    </ul>
  </div>
</template>
