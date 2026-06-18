import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { sendSseToUser } from '../utils/sseClients.js';
import notificationRepository from '../repositories/notification.repository.js';

export const createNotification = async ({
  userId,
  type,
  content,
  linkUrl,
  targetId,
  targetType,
  tx,
}) => {
  const notification = await notificationRepository.createNotification({
    data: {
      userId,
      type,
      content,
      linkUrl,
      targetId,
      targetType,
    },
    tx,
  });

  sendSseToUser(userId, 'notification', notification);

  return notification;
};

export const getNotificationsService = async (userId) => {
  const notifications = await notificationRepository.getNotifications({
    userId,
  });

  const unreadCount = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  return {
    items: notifications,
    meta: {
      totalCount: notifications.length,
      unreadCount,
    },
  };
};

export const readNotificationsService = async (userId, notificationId) => {
  const parsedNotificationId = Number(notificationId);

  if (!Number.isInteger(parsedNotificationId) || parsedNotificationId <= 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('notificationId가 올바르지 않습니다.')
    );
  }

  const notification = await notificationRepository.getNotificationById({
    id: parsedNotificationId,
  });

  if (!notification) {
    throw new AppError(ERROR_CODES.NOTIFICATION_NOT_FOUND());
  }

  if (notification.userId !== userId) {
    throw new AppError(
      ERROR_CODES.FORBIDDEN('해당 알림에 접근할 권한이 없습니다.')
    );
  }

  return await notificationRepository.readNotification({
    id: parsedNotificationId,
  });
};

export const readAllNotificationsService = async (userId) => {
  return await notificationRepository.readAllNotifications({
    userId,
  });
};
