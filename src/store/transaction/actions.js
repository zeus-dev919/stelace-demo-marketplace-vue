import { values, uniqBy } from 'lodash'
import stelace, { fetchAllResults } from 'src/utils/stelace'
import * as types from 'src/store/mutation-types'
import { paymentsApi } from 'src/utils/url'

export async function createTransaction ({ state, dispatch, rootGetters }, { asset } = {}) {
  const {
    startDate,
    endDate,
    quantity
  } = state
  const {
    paymentActive
  } = rootGetters

  const transactionAttrs = {
    assetId: asset.id
  }
  if (startDate) transactionAttrs.startDate = startDate
  if (endDate) transactionAttrs.endDate = endDate
  if (quantity) transactionAttrs.quantity = quantity

  let transaction = await stelace.transactions.create(transactionAttrs)

  if (paymentActive) return { transaction }

  const message = await stelace.messages.create({
    content: ' ',
    topicId: transaction.id,
    receiverId: transaction.ownerId,
    metadata: {
      isHiddenMessage: true
    }
  })

  transaction = await dispatch('createTransactionTransition', {
    transactionId: transaction.id,
    transitionName: 'confirmAndPay'
  })

  return {
    transaction,
    message
  }
}

export async function createTransactionTransition ({ commit, state }, { transactionId, transitionName, data }) {
  const transaction = await stelace.transactions.createTransition(transactionId, { name: transitionName, data })
  commitTransaction({ commit, state }, { transaction })
  return transaction
}

function commitTransaction ({ commit, state }, { transaction }) {
  const newTransactionsById = Object.assign({}, state.transactionsById)
  newTransactionsById[transaction.id] = transaction

  commit({
    type: types.INBOX__SET_TRANSACTIONS,
    transactions: values(newTransactionsById)
  })
}

export async function fetchTransactions ({ commit }, { userId, assetId, asTaker, asOwner }) {
  const fetchTransactionsRequest = (...args) => stelace.transactions.list(...args)

  const fetchAllTransactionsAsOwner = fetchAllResults(fetchTransactionsRequest, {
    ownerId: userId,
    assetId
  })
  const fetchAllTransactionsAsTaker = fetchAllResults(fetchTransactionsRequest, {
    takerId: userId,
    assetId
  })

  const [
    transactionsAsOwner,
    transactionsAsTaker,
  ] = await Promise.all([
    asOwner ? fetchAllTransactionsAsOwner : [],
    asTaker ? fetchAllTransactionsAsTaker : [],
  ])

  const allTransactions = transactionsAsOwner.concat(transactionsAsTaker)

  return uniqBy(allTransactions, transaction => transaction.id)
}

export async function previewTransaction ({ commit }, { assetId, startDate, endDate, quantity }) {
  const previewAttrs = { assetId }
  if (startDate) previewAttrs.startDate = startDate
  if (endDate) previewAttrs.endDate = endDate
  if (quantity) previewAttrs.quantity = quantity

  const preview = await stelace.transactions.preview(previewAttrs)

  commit({
    type: types.SET_TRANSACTION_PREVIEW,
    preview
  })

  return preview
}

export function resetTransactionPreview ({ commit }) {
  commit({
    type: types.SET_TRANSACTION_PREVIEW,
    preview: null
  })
}

export async function getStripeCustomer ({ dispatch, rootGetters }) {
  const currentUserId = rootGetters.currentUser.id
  const url = paymentsApi.getStripeCustomer

  await stelace.forward.post(url, {
    userId: currentUserId
  })

  await dispatch('fetchCurrentUser', { forceRefresh: true })
}

export async function createStripeCheckoutSession ({ rootGetters }, { transactionId }) {
  const url = paymentsApi.createStripeCheckoutSession

  const { id: sessionId } = await stelace.forward.post(url, {
    transactionId
  })

  return sessionId
}
