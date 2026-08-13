<script setup lang="ts"></script>

<template>
  <!-- Class order is deliberately wrong: Tailwind sorts margin before padding, so this must
       come out as `mt-2 p-4`. Written the other way round so the rule has something to fix. -->
  <div class="p-4 mt-2">Hello</div>
</template>
