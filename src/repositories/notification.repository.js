import prisma from '../configs/prisma.js';

const notificationRepository = {
  createNotification: async ({ data, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.notification.create({
      data,
    });
  },

  getNotifications: async ({ userId, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.notification.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  getNotificationById: async ({ id, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.notification.findUnique({
      where: {
        id,
      },
    });
  },

  readNotification: async ({ id, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.notification.update({
      where: {
        id,
      },
      data: {
        isRead: true,
      },
    });
  },

  readAllNotifications: async ({ userId, tx }) => {
    const dbClient = tx || prisma;

    return await dbClient.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  },
};

export default notificationRepository;
