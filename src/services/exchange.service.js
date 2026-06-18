import { ExchangeStatus, CardStatus, SaleStatus } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import exchangeProposalRepository from '../repositories/exchangeProposal.repository.js';
import cardCopyRepository from '../repositories/cardCopy.repository.js';
import { createNotification } from './notification.service.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';

const EXCHANGE_STATUS = new Set([
  ExchangeStatus.PENDING,
  ExchangeStatus.ACCEPTED,
  ExchangeStatus.REJECTED,
  ExchangeStatus.CANCELED,
]);

function validatePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR(`${fieldName}가 올바르지 않습니다.`)
    );
  }
}

export async function createProposal({
  userId,
  saleId,
  offeredCardCopyId,
  description,
}) {
  validatePositiveInteger(saleId, 'saleId');
  validatePositiveInteger(offeredCardCopyId, 'offeredCardCopyId');

  const normalizedDescription =
    typeof description === 'string' ? description.trim() : '';

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      saleItems: true,
      photoCard: {
        select: {
          name: true,
          grade: true,
        },
      },
    },
  });

  if (!sale) {
    throw new AppError(ERROR_CODES.SALE_NOT_FOUND());
  }

  if (sale.status !== SaleStatus.ON_SALE) {
    throw new AppError(
      ERROR_CODES.SALE_NOT_AVAILABLE(
        '판매 중인 카드만 교환 제안을 보낼 수 있습니다.'
      )
    );
  }

  if (sale.sellerId === userId) {
    throw new AppError(ERROR_CODES.CANNOT_EXCHANGE_OWN_CARD());
  }

  if (sale.saleItems.length === 0) {
    throw new AppError(
      ERROR_CODES.SALE_ITEM_NOT_FOUND('판매글에 연결된 판매 카드가 없습니다.')
    );
  }

  const saleCardCopy = await cardCopyRepository.getCardCopyById({
    id: sale.saleItems[0].cardCopyId,
  });

  if (!saleCardCopy) {
    throw new AppError(
      ERROR_CODES.REQUESTED_CARD_NOT_FOUND('판매 카드 사본을 찾을 수 없습니다.')
    );
  }

  if (saleCardCopy.status !== CardStatus.ON_SALE) {
    throw new AppError(
      ERROR_CODES.EXCHANGE_NOT_AVAILABLE(
        '현재 교환 가능한 판매 카드 상태가 아닙니다.'
      )
    );
  }

  const offeredCopy = await cardCopyRepository.getCardCopyById({
    id: offeredCardCopyId,
    include: {
      owner: {
        select: {
          nickname: true,
        },
      },
    },
  });

  if (!offeredCopy) {
    throw new AppError(ERROR_CODES.OFFERED_CARD_NOT_FOUND());
  }

  if (offeredCopy.ownerId !== userId) {
    throw new AppError(
      ERROR_CODES.CARD_COPY_NOT_OWNED('본인 소유 카드만 제안할 수 있습니다.')
    );
  }

  if (offeredCopy.status !== CardStatus.OWNED) {
    throw new AppError(
      ERROR_CODES.EXCHANGE_NOT_AVAILABLE('교환 가능한 카드 상태가 아닙니다.')
    );
  }

  const duplicated = await exchangeProposalRepository.findDuplicatedProposal({
    saleId,
    proposerId: userId,
    offeredCardCopyId,
    status: ExchangeStatus.PENDING,
  });

  if (duplicated) {
    throw new AppError(
      ERROR_CODES.EXCHANGE_ALREADY_EXISTS(
        '이미 동일한 교환 제안이 대기중입니다.'
      )
    );
  }

  const proposal = await prisma.$transaction(async (tx) => {
    const proposal = await exchangeProposalRepository.createProposal({
      data: {
        saleId,
        proposerId: userId,
        offeredCardCopyId,
        description: normalizedDescription,
      },
      tx,
    });

    await createNotification({
      userId: sale.sellerId,
      type: 'EXCHANGE_REQUEST',
      content: `${offeredCopy.owner.nickname}님이 [${sale.photoCard.grade} | ${sale.photoCard.name}]의 포토카드 교환을 제안했습니다.`,
      linkUrl: `/my-shop/${saleId}`,
      targetId: proposal.id,
      targetType: 'EXCHANGE',
      tx,
    });

    return proposal;
  });
  return proposal;
}

export async function listProposals({
  userId,
  type,
  status,
  page = 1,
  limit = 10,
}) {
  if (!['sent', 'received'].includes(type)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('type은 sent 또는 received만 가능합니다.')
    );
  }

  if (status && !EXCHANGE_STATUS.has(status)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('유효하지 않은 교환 상태값입니다.')
    );
  }

  if (!Number.isInteger(page) || page < 1) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('page는 1 이상의 정수여야 합니다.')
    );
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('limit은 1 이상의 정수여야 합니다.')
    );
  }

  const safeLimit = Math.min(limit, 50);
  const skip = (page - 1) * safeLimit;

  const where = {
    ...(status ? { status } : {}),
    ...(type === 'sent'
      ? { proposerId: userId }
      : { sale: { sellerId: userId } }),
  };

  const [totalCount, items] = await Promise.all([
    exchangeProposalRepository.countProposals({ where }),
    exchangeProposalRepository.getProposalList({
      where,
      skip,
      take: safeLimit,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / safeLimit);

  return {
    items,
    meta: {
      page,
      limit: safeLimit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
}

export async function rejectProposal({ userId, proposalId }) {
  validatePositiveInteger(proposalId, 'proposalId');

  const proposal = await exchangeProposalRepository.getProposalById({
    id: proposalId,
    include: {
      sale: {
        include: {
          photoCard: {
            select: {
              grade: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!proposal) {
    throw new AppError(ERROR_CODES.EXCHANGE_NOT_FOUND());
  }

  if (proposal.sale.sellerId !== userId) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN('받은 교환 요청만 거절할 수 있습니다.')
    );
  }

  if (proposal.status !== ExchangeStatus.PENDING) {
    throw new AppError(
      ERROR_CODES.EXCHANGE_ALREADY_PROCESSED(
        '대기중인 교환 제안만 거절할 수 있습니다.'
      )
    );
  }

  await prisma.$transaction(async (tx) => {
    await exchangeProposalRepository.setStatus({
      id: proposalId,
      prevStatus: ExchangeStatus.PENDING,
      newStatus: ExchangeStatus.REJECTED,
      tx,
    });

    await createNotification({
      userId: proposal.proposerId,
      type: 'EXCHANGE_REJECTED',
      content: `[${proposal.sale.photoCard.grade} | ${proposal.sale.photoCard.name}] 포토카드 교환 제안이 거절되었습니다.`,
      linkUrl: `/market/${proposal.saleId}`,
      targetId: proposal.id,
      targetType: 'EXCHANGE',
      tx,
    });
  });

  return {
    ...proposal,
    status: ExchangeStatus.REJECTED,
  };
}

export async function cancelProposal({ userId, proposalId }) {
  validatePositiveInteger(proposalId, 'proposalId');

  const proposal = await exchangeProposalRepository.getProposalById({
    id: proposalId,
  });

  if (!proposal) {
    throw new AppError(ERROR_CODES.EXCHANGE_NOT_FOUND());
  }

  if (proposal.proposerId !== userId) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN('본인이 보낸 교환 제안만 취소할 수 있습니다.')
    );
  }

  if (proposal.status !== ExchangeStatus.PENDING) {
    throw new AppError(
      ERROR_CODES.EXCHANGE_ALREADY_PROCESSED(
        '대기중인 교환 제안만 취소할 수 있습니다.'
      )
    );
  }

  await exchangeProposalRepository.setStatus({
    id: proposalId,
    prevStatus: ExchangeStatus.PENDING,
    newStatus: ExchangeStatus.CANCELED,
  });

  return {
    ...proposal,
    status: ExchangeStatus.CANCELED,
  };
}

export async function acceptProposal({ userId, proposalId }) {
  validatePositiveInteger(proposalId, 'proposalId');

  return prisma.$transaction(async (tx) => {
    const proposal = await exchangeProposalRepository.getProposalById({
      id: proposalId,
      include: {
        sale: {
          include: {
            saleItems: true,
            photoCard: {
              select: {
                grade: true,
                name: true,
              },
            },
          },
        },
        offeredCardCopy: true,
      },
      tx,
    });

    if (!proposal) {
      throw new AppError(ERROR_CODES.EXCHANGE_NOT_FOUND());
    }

    if (proposal.sale.sellerId !== userId) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN('받은 교환 요청만 승인할 수 있습니다.')
      );
    }

    if (proposal.status !== ExchangeStatus.PENDING) {
      throw new AppError(
        ERROR_CODES.EXCHANGE_ALREADY_PROCESSED(
          '대기중인 교환 제안만 승인할 수 있습니다.'
        )
      );
    }

    if (proposal.sale.saleItems.length === 0) {
      throw new AppError(
        ERROR_CODES.SALE_ITEM_NOT_FOUND('판매글에 연결된 판매 카드가 없습니다.')
      );
    }

    const saleCardCopy = await cardCopyRepository.getCardCopyById({
      id: proposal.sale.saleItems[0].cardCopyId,
      tx,
    });

    if (!saleCardCopy) {
      throw new AppError(
        ERROR_CODES.REQUESTED_CARD_NOT_FOUND(
          '판매 카드 사본을 찾을 수 없습니다.'
        )
      );
    }

    if (saleCardCopy.ownerId !== userId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR(
          '판매 카드의 소유권이 이미 변경되었습니다.'
        )
      );
    }

    if (saleCardCopy.status !== CardStatus.ON_SALE) {
      throw new AppError(
        ERROR_CODES.EXCHANGE_NOT_AVAILABLE(
          '현재 판매 카드 상태에서는 교환을 승인할 수 없습니다.'
        )
      );
    }

    const offeredCardCopy = await cardCopyRepository.getCardCopyById({
      id: proposal.offeredCardCopyId,
      tx,
    });

    if (!offeredCardCopy) {
      throw new AppError(ERROR_CODES.OFFERED_CARD_NOT_FOUND());
    }

    if (offeredCardCopy.ownerId !== proposal.proposerId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR(
          '제안 카드의 소유권이 이미 변경되었습니다.'
        )
      );
    }

    if (offeredCardCopy.status !== CardStatus.OWNED) {
      throw new AppError(
        ERROR_CODES.EXCHANGE_NOT_AVAILABLE(
          '현재 제안 카드 상태에서는 교환을 승인할 수 없습니다.'
        )
      );
    }

    await cardCopyRepository.updateCardCopy({
      id: saleCardCopy.id,
      data: {
        ownerId: proposal.proposerId,
        status: CardStatus.OWNED,
      },
      tx,
    });

    await cardCopyRepository.updateCardCopy({
      id: offeredCardCopy.id,
      data: {
        ownerId: userId,
        status: CardStatus.OWNED,
      },
      tx,
    });

    await exchangeProposalRepository.setStatus({
      id: proposalId,
      prevStatus: ExchangeStatus.PENDING,
      newStatus: ExchangeStatus.ACCEPTED,
      tx,
    });

    await exchangeProposalRepository.cancelOtherPendingProposals({
      saleId: proposal.saleId,
      excludeId: proposalId,
      tx,
    });

    await tx.sale.update({
      where: { id: proposal.saleId },
      data: {
        status: SaleStatus.SOLD_OUT,
      },
    });

    await createNotification({
      userId: proposal.proposerId,
      type: 'EXCHANGE_ACCEPTED',
      content: `[${proposal.sale.photoCard.grade} | ${proposal.sale.photoCard.name}] 포토카드 교환이 성사되었습니다.`,
      linkUrl: '/my-gallery',
      targetId: proposal.id,
      targetType: 'EXCHANGE',
      tx,
    });

    return {
      ...proposal,
      status: ExchangeStatus.ACCEPTED,
    };
  });
}
