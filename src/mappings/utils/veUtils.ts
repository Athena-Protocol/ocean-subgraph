import { BigDecimal, ethereum, BigInt, Address } from '@graphprotocol/graph-ts'
import {
  VeAllocateUser,
  VeAllocateId,
  VeAllocation,
  VeAllocationUpdate,
  VeDelegation,
  VeOCEAN,
  VeDeposit,
  VeFeeDistributor
} from '../../@types/schema'
import { veFeeDistributor as VeFeeDistributorContract } from '../../@types/veFeeDistributor/veFeeDistributor'
import { veAllocationUpdateType } from './constants'
import { getToken } from './tokenUtils'

export function getveOCEAN(id: string): VeOCEAN {
  let ve = VeOCEAN.load(id)

  if (ve === null) {
    ve = new VeOCEAN(id)
    ve.unlockTime = BigInt.zero()
    ve.lockedAmount = BigDecimal.zero()
    ve.block = 0
    ve.save()
  }

  return ve
}

export function getveAllocateUser(
  event: ethereum.Event,
  sender: string
): VeAllocateUser {
  let allocateUser = VeAllocateUser.load(sender)
  if (allocateUser === null) {
    allocateUser = new VeAllocateUser(sender)
    allocateUser.allocatedTotal = BigDecimal.zero()

    allocateUser.firstContact = event.block.timestamp.toI32()
    allocateUser.tx = event.transaction.hash.toHex()
    allocateUser.block = event.block.number.toI32()
    allocateUser.lastContact = 0
    const veOcean = getveOCEAN(sender)
    allocateUser.veOcean = veOcean.id

    allocateUser.save()
  }

  return allocateUser
}

export function getveAllocateId(
  event: ethereum.Event,
  id: string
): VeAllocateId {
  let allocateId = VeAllocateId.load(id)
  if (allocateId === null) {
    allocateId = new VeAllocateId(id)
    allocateId.allocatedTotal = BigDecimal.zero()

    allocateId.firstContact = event.block.timestamp.toI32()
    allocateId.tx = event.transaction.hash.toHex()
    allocateId.block = event.block.number.toI32()
    allocateId.lastContact = 0
    allocateId.chainId = BigInt.zero()
    allocateId.nftAddress = ''

    allocateId.save()
  }

  return allocateId
}

export function getveAllocation(
  event: ethereum.Event,
  sender: string,
  id: string
): VeAllocation {
  let veAllocation = VeAllocation.load(sender + '-' + id)
  if (veAllocation === null) {
    veAllocation = new VeAllocation(sender + '-' + id)
    veAllocation.allocationUser = getveAllocateUser(event, sender).id
    veAllocation.allocationId = getveAllocateId(event, id).id
    veAllocation.allocated = BigDecimal.zero()
    veAllocation.chainId = BigInt.zero()
    veAllocation.nftAddress = ''

    veAllocation.firstContact = event.block.timestamp.toI32()
    veAllocation.tx = event.transaction.hash.toHex()
    veAllocation.block = event.block.number.toI32()
    veAllocation.lastContact = 0

    veAllocation.save()
  }

  return veAllocation
}

// Pass veAllocation being updated
export function writeveAllocationUpdate(
  event: ethereum.Event,
  veAllocationId: string,
  allocationType: string,
  amount: BigDecimal
): VeAllocationUpdate {
  const tx = event.transaction.hash.toHex()
  let allocationUpdate = VeAllocationUpdate.load(tx + '-' + veAllocationId)
  if (allocationUpdate === null) {
    allocationUpdate = new VeAllocationUpdate(tx + '-' + veAllocationId)
    allocationUpdate.veAllocation = veAllocationId
    allocationUpdate.type = allocationType
    allocationUpdate.allocatedTotal = amount

    allocationUpdate.timestamp = event.block.timestamp.toI32()
    allocationUpdate.tx = event.transaction.hash.toHex()
    allocationUpdate.block = event.block.number.toI32()

    allocationUpdate.save()
  }

  return allocationUpdate
}

export function getveDelegation(id: string): VeDelegation {
  let veDelegation = VeDelegation.load(id)

  if (veDelegation === null) {
    veDelegation = new VeDelegation(id)
    veDelegation.cancelTime = BigInt.zero()
    veDelegation.expireTime = BigInt.zero()
    veDelegation.tokenId = BigInt.zero()
    veDelegation.amount = BigInt.zero()
    veDelegation.receiver = ''
    veDelegation.delegator = ''
    veDelegation.block = 0
    veDelegation.save()
  }
  return veDelegation
}

export function getDeposit(id: string): VeDeposit {
  let deposit = VeDeposit.load(id)

  if (deposit === null) {
    deposit = new VeDeposit(id)
    deposit.provider = ''
    deposit.sender = ''
    deposit.value = BigDecimal.zero()
    deposit.unlockTime = BigInt.zero()
    deposit.type = BigInt.zero()
    deposit.timestamp = BigInt.zero()
    deposit.tx = ''
    deposit.block = 0
    // do not save it
    // deposit.save()
  }
  return deposit
}

export function handleOneAllocation(
  eventSender: string,
  nftAddress: string,
  chainId: BigInt,
  allocationAmount: BigDecimal,
  event: ethereum.Event
): void {
  const eventId = nftAddress + '-' + chainId.toString()

  const allocateUser = getveAllocateUser(event, eventSender)
  const allocateId = getveAllocateId(event, eventId)
  const veAllocation = getveAllocation(event, eventSender, eventId)

  // Update user allocation
  const newUserAllocation = allocateUser.allocatedTotal.minus(
    veAllocation.allocated
  )
  allocateUser.allocatedTotal = newUserAllocation.plus(allocationAmount)

  // Update id allocation
  const newIdAllocation = allocateId.allocatedTotal.minus(
    veAllocation.allocated
  )
  allocateId.allocatedTotal = newIdAllocation.plus(allocationAmount)

  veAllocation.allocated = allocationAmount
  veAllocation.chainId = chainId
  veAllocation.nftAddress = nftAddress

  allocateUser.lastContact = event.block.timestamp.toI32()
  allocateId.lastContact = event.block.timestamp.toI32()
  veAllocation.lastContact = event.block.timestamp.toI32()

  // register allocation update event
  writeveAllocationUpdate(
    event,
    veAllocation.id,
    veAllocationUpdateType.SET,
    allocationAmount
  )

  allocateId.chainId = chainId
  allocateId.nftAddress = nftAddress

  // save entities
  allocateUser.save()
  allocateId.save()
  veAllocation.save()
}

export function getVeFeeDistributor(id: Address): VeFeeDistributor {
  let distributor = VeFeeDistributor.load(id.toHexString())

  if (distributor === null) {
    distributor = new VeFeeDistributor(id.toHexString())
    const contract = VeFeeDistributorContract.bind(id)
    const tokenAddress = contract.try_token()
    const token = getToken(tokenAddress.value, false)
    distributor.token = token.id
    distributor.save()
  }
  return distributor
}
