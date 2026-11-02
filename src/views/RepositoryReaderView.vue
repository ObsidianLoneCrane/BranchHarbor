<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  GitPullRequest,
  LoaderCircle,
  RefreshCw,
} from '@lucide/vue'
import RepositoryTabs from '../components/RepositoryTabs.vue'
import ReaderError from '../components/ReaderError.vue'
import ReaderPagination from '../components/ReaderPagination.vue'
import { createReader } from '../composables/reader'
import { useAccounts } from '../composables/accounts'
import { providerName } from '../lib/accounts'
import { stateLabel, type BranchRef, type ReaderFilter, type Resource } from '../lib/reader'

const route = useRoute()
const router = useRouter()
const reader = createReader()
const { state, remaining } = reader
const target = computed(() => ({
  accountId: String(route.params.accountId),
  owner: String(route.params.owner),
  name: String(route.params.name),
}))
const resource = computed(() => route.params.resource as Resource)
const number = computed(() => String(route.params.number ?? ''))
const title = computed(() => (resource.value === 'pulls' ? 'Pull requests' : 'Issues'))
const account = computed(() =>
  useAccounts().accounts.value.find((account) => account.id === target.value.accountId),
)
const filters = computed<ReaderFilter[]>(() =>
  resource.value === 'pulls'
    ? ['open', 'closed', 'merged', 'all']
    : account.value?.provider === 'gitee'
      ? ['open', 'progressing', 'closed', 'rejected', 'all']
      : ['open', 'closed', 'all'],
)
function page(value: unknown) {
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 1
  return result >= 1 && result <= 10000 ? result : 1
}
const filter = computed<ReaderFilter>(() => {
  const value = route.query.state
  return typeof value === 'string' &&
    ['open', 'closed', 'merged', 'progressing', 'rejected', 'all'].includes(value)
    ? (value as ReaderFilter)
    : 'open'
})
const listQuery = computed(() => ({ state: filter.value, page: String(page(route.query.page)) }))
const listLocation = computed(() => ({
  name: 'repository-reader',
  params: { ...target.value, resource: resource.value },
  query: listQuery.value,
}))
watch(
  () => [
    target.value.accountId,
    target.value.owner,
    target.value.name,
    resource.value,
    number.value,
    filter.value,
    route.query.page,
    route.query.comments,
  ],
  () => {
    void reader.open({
      target: target.value,
      resource: resource.value,
      filter: filter.value,
      page: page(route.query.page),
      number: number.value,
      commentPage: page(route.query.comments),
    })
  },
  { immediate: true },
)
onUnmounted(reader.dispose)
function changeFilter(value: string) {
  void router.push({ ...listLocation.value, query: { state: value, page: '1' } })
}
function listPage(value: number) {
  void router.push({ ...listLocation.value, query: { ...listQuery.value, page: String(value) } })
}
function commentPage(value: number) {
  void router.push({
    name: 'repository-reader',
    params: { ...target.value, resource: resource.value, number: number.value },
    query: { ...listQuery.value, comments: String(value) },
  })
}
function when(value: string | null) {
  if (!value) return 'Time unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
}
function author(value: string | null) {
  return value ? `@${value}` : 'Unknown author'
}
function branch(value: BranchRef | null) {
  return value?.name
    ? `${value.repository ? `${value.repository}:` : ''}${value.name}`
    : 'Branch unavailable'
}
</script>

<template>
  <RouterLink to="/repositories" class="text-link explorer-back"
    ><ArrowLeft :size="14" aria-hidden="true" />Back to repositories</RouterLink
  >
  <div class="page-heading explorer-heading">
    <div>
      <p class="eyebrow">CONVERSATIONS AROUND YOUR CODE</p>
      <h1 id="page-title" tabindex="-1">{{ target.owner }}/{{ target.name }}</h1>
      <p v-if="account" class="explorer-account">
        {{ providerName(account.provider) }} · @{{ account.login }}
      </p>
    </div>
    <button
      class="button button-secondary"
      :disabled="!!state.busy || remaining > 0"
      @click="reader.refresh"
    >
      <RefreshCw :size="13" aria-hidden="true" />Refresh
    </button>
  </div>
  <RepositoryTabs />
  <ReaderError
    v-if="state.error && state.errorFor !== 'comments'"
    :error="state.error"
    :remaining="remaining"
    :busy="!!state.busy"
    @retry="reader.retry"
  />
  <section
    v-if="!number"
    class="panel reader-panel"
    :aria-label="title"
    :aria-busy="state.busy === 'list'"
  >
    <div class="reader-list-toolbar">
      <h2>
        <GitPullRequest v-if="resource === 'pulls'" :size="17" aria-hidden="true" /><CircleDot
          v-else
          :size="17"
          aria-hidden="true"
        />{{ title }}
      </h2>
      <label
        >State<select
          class="form-control"
          :value="filter"
          :disabled="remaining > 0"
          @change="changeFilter(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="value in filters" :key="value" :value="value">
            {{ value === 'all' ? 'All states' : stateLabel(value) }}
          </option>
        </select></label
      >
    </div>
    <div v-if="state.busy === 'list'" class="repository-status" role="status">
      <LoaderCircle :size="18" class="loading-icon" aria-hidden="true" />Loading
      {{ resource === 'pulls' ? 'pull requests' : 'issues' }}...
    </div>
    <template v-else-if="state.list">
      <p v-if="state.list.filtered" class="reader-filter-notice">
        This provider page includes entries excluded by this view or state filter. Pagination
        follows the provider's pages.
      </p>
      <ul v-if="state.list.items.length" class="discussion-list">
        <li v-for="item in state.list.items" :key="item.number">
          <div class="discussion-title">
            <span class="work-state" :class="`work-state-${item.state}`">{{
              stateLabel(item.state)
            }}</span>
            <h3>
              <RouterLink
                :to="{
                  name: 'repository-reader',
                  params: { ...target, resource, number: item.number },
                  query: listQuery,
                }"
                >{{ item.title }}</RouterLink
              >
            </h3>
            <span v-if="item.draft" class="subtle-badge">Draft</span>
          </div>
          <p class="discussion-meta">
            #{{ item.number }} · {{ author(item.author) }} · Updated {{ when(item.updatedAt) }}
          </p>
          <div v-if="item.labels.length" class="discussion-labels">
            <span v-for="label in item.labels.slice(0, 3)" :key="label">{{ label }}</span
            ><span v-if="item.labels.length > 3">+{{ item.labels.length - 3 }}</span>
          </div>
        </li>
      </ul>
      <div v-else class="preview-placeholder">
        <h3>No {{ resource === 'pulls' ? 'pull requests' : 'issues' }} on this page</h3>
        <p>
          {{
            state.list.hasNext
              ? 'This page has no matching entries. Continue to the next page or change the state filter.'
              : 'No matching entries were returned. Try another state filter.'
          }}
        </p>
      </div>
      <ReaderPagination
        :page="state.list.page"
        :has-next="state.list.hasNext"
        :disabled="!!state.busy || remaining > 0"
        context="discussion"
        @change="listPage"
      />
    </template>
    <p class="panel-footnote">
      Read-only · Only discussions accessible to the selected token are shown.
    </p>
  </section>
  <template v-else>
    <RouterLink :to="listLocation" class="text-link reader-back"
      ><ArrowLeft :size="13" aria-hidden="true" />Back to
      {{ resource === 'pulls' ? 'pull requests' : 'issues' }}</RouterLink
    >
    <div v-if="state.busy === 'detail'" class="panel repository-status" role="status">
      <LoaderCircle :size="18" class="loading-icon" aria-hidden="true" />Loading discussion...
    </div>
    <template v-if="state.detail">
      <article class="panel discussion-detail" aria-label="Discussion detail">
        <header>
          <div class="discussion-title">
            <span class="work-state" :class="`work-state-${state.detail.item.state}`">{{
              stateLabel(state.detail.item.state)
            }}</span
            ><span v-if="state.detail.item.draft" class="subtle-badge">Draft</span
            ><span class="discussion-number">#{{ state.detail.item.number }}</span>
          </div>
          <h2>{{ state.detail.item.title }}</h2>
          <p class="discussion-meta">
            {{ author(state.detail.item.author) }} · Created
            {{ when(state.detail.item.createdAt) }} · Updated
            {{ when(state.detail.item.updatedAt) }}
          </p>
          <p v-if="state.detail.mergedAt || state.detail.closedAt" class="discussion-meta">
            {{ state.detail.mergedAt ? 'Merged' : 'Closed' }}
            {{ when(state.detail.mergedAt ?? state.detail.closedAt) }}
          </p>
          <div v-if="state.detail.item.labels.length" class="discussion-labels">
            <span v-for="label in state.detail.item.labels" :key="label">{{ label }}</span>
          </div>
          <div v-if="resource === 'pulls'" class="reader-branches">
            <span>{{ branch(state.detail.head) }}</span
            ><ArrowRight :size="14" aria-hidden="true" /><span>{{
              branch(state.detail.base)
            }}</span>
          </div>
        </header>
        <div class="discussion-body">
          <p v-if="state.detail.bodyTruncated" class="reader-truncated" role="status">
            Description truncated at the 64 KiB preview limit.
          </p>
          <p class="discussion-body-text">{{ state.detail.body || 'No description provided.' }}</p>
        </div>
      </article>
      <section
        class="panel comments-panel"
        aria-label="Discussion comments"
        :aria-busy="state.busy === 'comments'"
      >
        <div class="panel-toolbar">
          <h2>Comments</h2>
          <span class="subtle-badge">Discussion only</span>
        </div>
        <ReaderError
          v-if="state.error && state.errorFor === 'comments'"
          :error="state.error"
          :remaining="remaining"
          :busy="!!state.busy"
          @retry="reader.retry"
        />
        <p v-if="state.busy === 'comments'" class="repository-status" role="status">
          Loading comments...
        </p>
        <template v-else-if="state.comments"
          ><ol v-if="state.comments.items.length" class="discussion-comments">
            <li v-for="comment in state.comments.items" :key="comment.id">
              <article>
                <header>
                  <strong>{{ author(comment.author) }}</strong
                  ><span
                    >{{ when(comment.createdAt)
                    }}<span v-if="comment.updatedAt && comment.updatedAt !== comment.createdAt">
                      · Edited {{ when(comment.updatedAt) }}</span
                    ></span
                  >
                </header>
                <p v-if="comment.bodyTruncated" class="reader-truncated" role="status">
                  Comment truncated at the 64 KiB preview limit.
                </p>
                <p class="discussion-body-text">{{ comment.body || 'Empty comment.' }}</p>
              </article>
            </li>
          </ol>
          <p v-else class="preview-placeholder">No comments on this page.</p>
          <ReaderPagination
            :page="state.comments.page"
            :has-next="state.comments.hasNext"
            :disabled="!!state.busy || remaining > 0"
            context="comments"
            @change="commentPage"
        /></template>
        <p class="panel-footnote">
          Descriptions and comments are shown as plain text. Inline code reviews and review threads
          are not included.
        </p>
      </section>
    </template>
  </template>
</template>
