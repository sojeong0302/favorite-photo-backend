import prisma from '../configs/prisma.js';

const exchangeProposalRepository = {
  getExchangeProposal: async ({ saleId, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.findMany({
      where: { saleId },
    });
  },

  getProposalById: async ({ id, include, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.findUnique({
      where: { id },
      include,
    });
  },

  createProposal: async ({ data, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.create({
      data,
    });
  },

  findDuplicatedProposal: async ({
    saleId,
    proposerId,
    offeredCardCopyId,
    status,
    tx,
  }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.findFirst({
      where: {
        saleId,
        proposerId,
        offeredCardCopyId,
        status,
      },
    });
  },

  countProposals: async ({ where, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.count({
      where,
    });
  },

  getProposalList: async ({ where, skip, take, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.findMany({
      where,
      include: {
        proposer: {
          select: {
            id: true,
            nickname: true,
          },
        },
        sale: {
          select: {
            id: true,
            sellerId: true,
            photoCardId: true,
            price: true,
            status: true,
            photoCard: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                grade: true,
                genre: true,
              },
            },
          },
        },
        offeredCardCopy: {
          select: {
            id: true,
            ownerId: true,
            photoCardId: true,
            status: true,
            serialNumber: true,
            photoCard: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                grade: true,
                genre: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    });
  },

  setStatus: async ({ id, prevStatus, newStatus, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.updateMany({
      where: {
        id,
        ...(prevStatus && { status: prevStatus }),
      },
      data: {
        status: newStatus,
      },
    });
  },

  setProposalsStatus: async ({ ids, prevStatus, newStatus, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.updateMany({
      where: {
        id: {
          in: ids,
        },
        ...(prevStatus && { status: prevStatus }),
      },
      data: {
        status: newStatus,
      },
    });
  },

  cancelOtherPendingProposals: async ({ saleId, excludeId, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.exchangeProposal.updateMany({
      where: {
        saleId,
        status: 'PENDING',
        id: {
          not: excludeId,
        },
      },
      data: {
        status: 'CANCELED',
      },
    });
  },
};

export default exchangeProposalRepository;
