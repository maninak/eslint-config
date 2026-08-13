<script setup lang="ts">
// Fixture: the unsafe value is used ONLY from the template, to measure whether type-aware
// rules reach template expressions or stop at the script block.
const payload = JSON.parse('{}')
</script>

<template>
  <div>{{ payload.field.nested }}</div>
</template>
