<script setup lang="ts">
import { t } from '../lib/locale'
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
const notice = ref<{ message: string; values: Record<string, string> }>()
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
  notice.value = undefined
  try {
    const account = await store.connect(provider.value, token.value, expected.value?.id)
    notice.value = {
      message: '{provider} account @{login} is connected.',
      values: { provider: providerName(account.provider), login: account.login },
    }
    dialog.value?.close()
  } catch (error) {
    connectError.value = accountError(error)
  } finally {
    token.value = ''
  }
}
async function disconnect(account: Account) {
  actionError.value = null
  notice.value = undefined
  try {
    await store.disconnect(account.id)
    removing.value = null
    notice.value = {
      message: 'Disconnected @{login}. Remote repositories were not changed.',
      values: { login: account.login },
    }
  } catch (error) {
    actionError.value = accountError(error)
  }
}
</script>

<template>
  <div class="panel connections-panel">
    <div v-if="!supported" class="connection-info">
      {{
        t(
          'Open the desktop app to connect accounts. This browser preview does not accept or save tokens.',
        )
      }}
    </div>
    <p v-if="loading" role="status" class="connection-info">{{ t('Loading saved accounts...') }}</p>
    <div v-if="error" class="account-alert" role="alert">
      <p>{{ t(error.message) }}</p>
      <button class="text-button" :disabled="loading || pending" @click="store.refresh">
        {{ t('Retry loading accounts') }}
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
              t(
                group.accounts.length > 1
                  ? '{count} connected accounts'
                  : group.accounts.length
                    ? '1 connected account'
                    : 'No account connected',
                { count: group.accounts.length },
              )
            }}
          </p>
        </div>
        <button
          class="button button-secondary"
          :aria-label="t('Add account to {provider}', { provider: providerName(group.provider) })"
          :disabled="!supported || pending"
          @click="open(group.provider)"
        >
          <Plus :size="13" aria-hidden="true" />{{ t('Add account') }}
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
              t(
                account.credentialStatus === 'saved'
                  ? 'Token saved in system credential storage'
                  : account.credentialStatus === 'missing'
                    ? 'Saved token is missing. Update the token to reconnect.'
                    : 'System credential storage is locked or unavailable.',
              )
            }}
          </p>
        </div>
        <div class="saved-account-actions">
          <button class="text-button" :disabled="pending" @click="open(account.provider, account)">
            {{ t('Update token') }}</button
          ><button
            class="text-button disconnect-button"
            :disabled="pending"
            @click="removing = removing === account.id ? null : account.id"
          >
            {{ t('Disconnect') }}<span class="sr-only"> {{ account.login }}</span>
          </button>
        </div>
        <div v-if="removing === account.id" class="disconnect-confirm">
          <p>
            {{
              t(
                'Remove this local connection and its saved token? Repositories and Git configuration will stay as they are.',
              )
            }}
          </p>
          <div>
            <button class="button button-secondary" :disabled="pending" @click="removing = null">
              {{ t('Cancel') }}</button
            ><button class="button button-danger" :disabled="pending" @click="disconnect(account)">
              {{ t(pending ? 'Removing...' : 'Confirm disconnect') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="actionError" class="account-alert" role="alert">{{ t(actionError.message) }}</div>
    <p v-if="notice" class="account-notice" role="status">{{ t(notice.message, notice.values) }}</p>
    <div class="panel-footnote">
      {{
        t(
          'Tokens stay in system credential storage. Platform connections do not configure your Git author identity or SSH/HTTPS credentials.',
        )
      }}
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
        <h2 id="connect-title">
          {{ t(expected ? 'Update account token' : 'Connect an account') }}
        </h2>
        <button
          type="button"
          class="icon-button"
          :aria-label="t('Close account form')"
          :disabled="pending"
          @click="close"
        >
          <X :size="18" />
        </button>
      </div>
      <p v-if="expected" class="dialog-description">
        {{
          t('Verify a new token for @{login} on {provider}.', {
            login: expected.login,
            provider: providerName(expected.provider),
          })
        }}
      </p>
      <p v-else class="dialog-description">
        {{ t('Use a personal access token to verify your identity and read your repositories.') }}
      </p>
      <label class="field-label" for="account-provider">{{ t('Platform') }}</label
      ><select
        id="account-provider"
        v-model="provider"
        class="form-control"
        :disabled="pending || !!expected"
      >
        <optgroup class="select-options" label="">
          <option value="github">GitHub</option>
          <option value="gitee">Gitee</option>
        </optgroup>
      </select>
      <label class="field-label" for="account-token">{{ t('Personal access token') }}</label
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
        :placeholder="t('Paste a personal access token')"
        :aria-invalid="connectError ? 'true' : undefined"
        aria-describedby="token-guidance"
      />
      <p id="token-guidance" class="field-help">
        {{
          t(
            provider === 'github'
              ? 'Select the repositories you want to view. Allow read access to Contents, Issues, and Pull requests as needed.'
              : 'Enable user_info and projects for repositories; add pull_requests and issues permissions to read discussions.',
          )
        }}
      </p>
      <div v-if="connectError" class="account-alert" role="alert">
        {{ t(connectError.message)
        }}<span v-if="connectError.retryAfterSeconds">
          {{ t('Retry after {count} seconds.', { count: connectError.retryAfterSeconds }) }}</span
        >
      </div>
      <p class="secure-note">
        <ShieldCheck :size="14" aria-hidden="true" />{{
          t("Stored in your operating system's credential store after verification.")
        }}
      </p>
      <div class="dialog-actions">
        <button type="button" class="button button-secondary" :disabled="pending" @click="close">
          {{ t('Cancel') }}</button
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
          />{{
            t(pending ? 'Verifying...' : expected ? 'Verify and update' : 'Verify and connect')
          }}
        </button>
      </div>
    </form>
  </dialog>
</template>
