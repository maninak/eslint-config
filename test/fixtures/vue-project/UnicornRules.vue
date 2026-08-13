<script setup lang="ts">
function failLoudly(): void {
  throw new Error()
}

defineExpose({ failLoudly })
</script>

<template>
  <div>content</div>
</template>
