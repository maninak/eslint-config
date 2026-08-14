
<template>
  <button>Click me
</button>
  <div>{{props.title }}</div>
</template>
<script setup lang="ts">
const props =defineProps({title: String,
})

const unused = 'never referenced'
const emit = defineEmits(['change'])
</script>
