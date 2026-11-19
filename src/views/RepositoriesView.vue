<script setup lang="ts">
import LocalRepositoryList from '../components/LocalRepositoryList.vue'
import RepositoryBrowser from '../components/RepositoryBrowser.vue'
import '../localGit.css'
</script>

<template>
  <div class="page-heading">
    <div>
      <p class="eyebrow">A PLACE FOR YOUR PROJECTS</p>
      <h1 id="page-title" tabindex="-1">Repositories</h1>
      <p class="page-description">Local projects and remote repositories, within reach.</p>
    </div>
  </div>
  <LocalRepositoryList />
  <RepositoryBrowser />
</template>
