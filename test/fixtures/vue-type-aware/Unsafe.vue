<script setup lang="ts">
// Fixture: an `any` flowing into a typed call, which only a type-aware rule can see.
const payload = JSON.parse('{}')

function send(value: string): string {
  return value
}

const sent = send(payload.field)
</script>

<template>
  <div>{{ sent }}</div>
</template>
