<script setup lang="ts">
const value = 1

function probe(): number {
  if (value > 0) return 1

  return 0
}
</script>

<template>
  <div>{{ probe() }}</div>
</template>
