import { SaleStatus } from '@prisma/client';
import prisma from '../configs/prisma.js';

const saleRepository = {
  createSale: async ({
    userId,
    photoCardId,
    price,
    exchangeGrade,
    exchangeGenre,
    exchangeDescription,
    tx,
  }) => {
    const dbClient = tx || prisma;
    return await dbClient.sale.create({
      data: {
        sellerId: userId,
        photoCardId: Number(photoCardId),
        price: Number(price),
        exchangeGrade,
        exchangeGenre,
        exchangeDescription,
      },
    });
  },

  modifySale: async ({ saleId, data, tx }) => {
    const dbClient = tx || prisma;
    return await dbClient.sale.update({
      where: { id: saleId },
      data: data,
    });
  },

  cancelSale: async ({ saleId, tx }) => {
    const dbClient = tx || prisma;
    return await dbClient.sale.update({
      where: { id: saleId },
      data: { status: SaleStatus.CANCELED },
    });
  },

  getSale: async ({ saleId, include, tx }) => {
    const dbClient = tx || prisma;
    return await dbClient.sale.findUnique({
      where: { id: saleId },
      include,
    });
  },

  setStatus: async ({ saleId, status, tx }) => {
    const dbClient = tx || prisma;
    return await dbClient.sale.update({
      where: { id: saleId },
      data: { status: status },
    });
  },

  isExist: async ({ saleId, tx }) => {
    const dbClient = tx || prisma;
    const isExist = await dbClient.sale.findUnique({
      where: { id: saleId },
    });
    return isExist ? true : false;
  },

  isOnSale: async ({ saleId, tx }) => {
    const dbClient = tx || prisma;
    const isOnSale = await dbClient.sale.findUnique({
      where: { id: saleId, status: SaleStatus.ON_SALE },
    });
    return isOnSale ? true : false;
  },
};

export default saleRepository;
