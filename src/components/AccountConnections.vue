<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ArrowRight, LoaderCircle, Plus, RefreshCw, ShieldCheck, X } from '@lucide/vue'
import { useAccounts } from '../composables/accounts'
import {
  accountError,
  hasNativeAccounts,
  providerName,
  type Account,
  type AccountError,
  type Provider,
} from '../lib/accounts'

const store = useAccounts()
const { accounts, loading, pending, error } = store
const supported = hasNativeAccounts()
const dialog = ref<HTMLDialogElement>()
const provider = ref<Provider>('github')
const token = ref('')
const expected = ref<Account | null>(null)
const connectError = ref<AccountError | null>(null)
const actionError = ref<AccountError | null>(null)
const removing = ref<string | null>(null)
const notice = ref('')
const grouped = computed(() =>
  (['github', 'gitee'] as const).map((value) => ({
    provider: value,
    accounts: accounts.value.filter((account) => account.provider === value),
  })),
)
onMounted(() => {
  void store.ensureLoaded()
})

async function open(value: Provider, account?: Account) {
  token.value = ''
  provider.value = value
  expected.value = account ?? null
  connectError.value = null
  await nextTick()
  dialog.value?.showModal()
}
function close() {
  if (!pending.value) {
    token.value = ''
    connectError.value = null
    dialog.value?.close()
  }
}
async function connect() {
  connectError.value = null
  notice.value = ''
  try {
    const account = await store.connect(provider.value, token.value, expected.value?.id)
    notice.value = `${providerName(account.provider)} account @${account.login} is connected.`
    dialog.value?.close()
  } catch (error) {
    connectError.value = accountError(error)
  } finally {
    token.value = ''
  }
}
async function disconnect(account: Account) {
  actionError.value = null
  notice.value = ''
  try {
    await store.disconnect(account.id)
    removing.value = null
    notice.value = `Disconnected @${account.login}. Remote repositories were not changed.`
  } catch (error) {
    actionError.value = accountError(error)
  }
}
</script>

<template>
  <div class="panel connections-panel">
    <div v-if="!supported" class="connection-info">
      Open the desktop app to connect accounts. This browser preview does not accept or save tokens.
    </div>
    <p v-if="loading" role="status" class="connection-info">Loading saved accounts...</p>
    <div v-if="error" class="account-alert" role="alert">
      <p>{{ error.message }}</p>
      <button class="text-button" :disabled="loading || pending" @click="store.refresh">
        Retry loading accounts
      </button>
    </div>
    <div v-for="group in grouped" :key="group.provider" class="provider-connections">
      <div class="provider-connection-heading">
        <span
          class="provider-mark"
          :class="{ gitee: group.provider === 'gitee' }"
          aria-hidden="true"
          >{{ group.provider === 'github' ? 'GH' : 'G' }}</span
        >
        <div class="account-description">
          <h3>{{ providerName(group.provider) }}</h3>
          <p>
            {{
              group.accounts.length
                ? `${group.accounts.length} connected account${group.accounts.length > 1 ? 's' : ''}`
                : 'No account connected'
            }}
          </p>
        </div>
        <button
          class="button button-secondary"
          :disabled="!supported || pending"
          @click="open(group.provider)"
        >
          <Plus :size="13" aria-hidden="true" />Add account<span class="sr-only">
            to {{ providerName(group.provider) }}</span
          >
        </button>
      </div>
      <div v-for="account in group.accounts" :key="account.id" class="saved-account">
        <span class="account-avatar" aria-hidden="true">{{
          account.login.slice(0, 2).toUpperCase()
        }}</span>
        <div class="saved-account-details">
          <strong
            >{{ account.name || account.login }} <span>@{{ account.login }}</span></strong
          >
          <p :class="{ 'credential-warning': account.credentialStatus !== 'saved' }">
            {{
              account.credentialStatus === 'saved'
                ? 'Token saved in system credential storage'
                : account.credentialStatus === 'missing'
                  ? 'Saved token is missing. Update the token to reconnect.'
                  : 'System credential storage is locked or unavailable.'
            }}
          </p>
        </div>
        <div class="saved-account-actions">
          <button class="text-button" :disabled="pending" @click="open(account.provider, account)">
            Update token</button
          ><button
            class="text-button disconnect-button"
            :disabled="pending"
            @click="removing = removing === account.id ? null : account.id"
          >
            Disconnect<span class="sr-only"> {{ account.login }}</span>
          </button>
        </div>
        <div v-if="removing === account.id" class="disconnect-confirm">
          <p>
            Remove this local connection and its saved token? Repositories and Git configuration
            will stay as they are.
          </p>
          <div>
            <button class="button button-secondary" :disabled="pending" @click="removing = null">
              Cancel</button
            ><button class="button button-danger" :disabled="pending" @click="disconnect(account)">
              {{ pending ? 'Removing...' : 'Confirm disconnect' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="actionError" class="account-alert" role="alert">{{ actionError.message }}</div>
    <p v-if="notice" class="account-notice" role="status">{{ notice }}</p>
    <div class="panel-footnote">
      Tokens stay in system credential storage. Platform connections do not configure your Git
      author identity or SSH/HTTPS credentials.
    </div>
  </div>
  <dialog
    ref="dialog"
    class="account-dialog"
    aria-labelledby="connect-title"
    @cancel.prevent="close"
    @close="token = ''"
  >
    <form @submit.prevent="connect">
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">A CONNECTION TO YOUR WORK</p>
          <h2 id="connect-title">{{ expected ? 'Update account token' : 'Connect an account' }}</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="Close account form"
          :disabled="pending"
          @click="close"
        >
          <X :size="18" />
        </button>
      </div>
      <p v-if="expected" class="dialog-description">
        Verify a new token for @{{ expected.login }} on {{ providerName(expected.provider) }}.
      </p>
      <p v-else class="dialog-description">
        Use a personal access token to verify your identity and read your repositories.
      </p>
      <label class="field-label" for="account-provider">Platform</label
      ><select
        id="account-provider"
        v-model="provider"
        class="form-control"
        :disabled="pending || !!expected"
      >
        <option value="github">GitHub</option>
        <option value="gitee">Gitee</option>
      </select>
      <label class="field-label" for="account-token">Personal access token</label
      ><input
        id="account-token"
        v-model="token"
        type="password"
        class="form-control"
        autocomplete="off"
        autocapitalize="off"
        :spellcheck="false"
        maxlength="4096"
        required
        :disabled="pending"
        placeholder="Paste a personal access token"
        :aria-invalid="connectError ? 'true' : undefined"
        aria-describedby="token-guidance"
      />
      <p id="token-guidance" class="field-help">
        {{
          provider === 'github'
            ? 'Allow access to the repositories you want to view. Fine-grained tokens must include the selected repositories.'
            : 'Enable user_info and projects permissions for account and repository access.'
        }}
        Repository coverage depends on the token's permissions.
      </p>
      <div v-if="connectError" class="account-alert" role="alert">
        {{ connectError.message
        }}<span v-if="connectError.retryAfterSeconds">
          Retry after {{ connectError.retryAfterSeconds }} seconds.</span
        >
      </div>
      <p class="secure-note">
        <ShieldCheck :size="14" aria-hidden="true" />Stored in your operating system's credential
        store after verification.
      </p>
      <div class="dialog-actions">
        <button type="button" class="button button-secondary" :disabled="pending" @click="close">
          Cancel</button
        ><button class="button button-primary" :disabled="pending || !token.trim()">
          <LoaderCircle
            v-if="pending"
            :size="14"
            class="loading-icon"
            aria-hidden="true"
          /><RefreshCw v-else-if="expected" :size="14" aria-hidden="true" /><ArrowRight
            v-else
            :size="14"
            aria-hidden="true"
          />{{ pending ? 'Verifying...' : expected ? 'Verify and update' : 'Verify and connect' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
