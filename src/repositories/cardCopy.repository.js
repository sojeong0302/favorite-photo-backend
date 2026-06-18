import prisma from '../configs/prisma.js';

const cardCopyRepository = {
  getCardCopys: async ({ quantity, photoCardId, userId, status, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.cardCopy.findMany({
      where: {
        photoCardId: Number(photoCardId),
        ownerId: userId,
        ...(status && { status }),
      },
      take: quantity ? Number(quantity) : undefined,
      orderBy: {
        id: 'asc',
      },
    });
  },

  getCardCopyById: async ({ id, include, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.cardCopy.findUnique({
      where: {
        id,
      },
      include,
    });
  },

  updateCardCopy: async ({ id, data, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.cardCopy.update({
      where: {
        id,
      },
      data,
    });
  },

  updateCardCopiesOwnerId: async ({ cardsIds, ownerId, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.cardCopy.updateMany({
      where: {
        id: {
          in: cardsIds,
        },
      },
      data: {
        ownerId,
      },
    });
  },

  switchCardsStatus: async ({ userId, cardIds, prevStatus, newStatus, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.cardCopy.updateMany({
      where: {
        id: {
          in: cardIds,
        },
        ownerId: userId,
        ...(prevStatus && { status: prevStatus }),
      },
      data: {
        status: newStatus,
      },
    });
  },
};

export default cardCopyRepository;
