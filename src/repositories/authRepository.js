import prisma from '../configs/prisma.js';
import { SIGNUP_POINTS } from '../constants/points.js';

export const findUserByEmail = (email) =>
  prisma.user.findUnique({ where: { email } });

export const findUserByNickname = (nickname) =>
  prisma.user.findUnique({ where: { nickname } });

export const findUserById = (id) => prisma.user.findUnique({ where: { id } });

export const findUserWithPoint = (id) =>
  prisma.user.findUnique({ where: { id }, include: { point: true } });

export const createUserWithPoint = ({ email, nickname, password }) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, nickname, password },
    });

    await tx.point.create({
      data: { userId: user.id, balance: SIGNUP_POINTS },
    });

    await tx.pointHistory.create({
      data: {
        userId: user.id,
        amount: SIGNUP_POINTS,
        reason: 'SIGN_UP',
        description: '회원가입 축하 포인트',
      },
    });

    return user;
  });

export const createRefreshToken = ({ userId, tokenHash, expiresAt }) =>
  prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

export const findRefreshToken = (tokenHash) =>
  prisma.refreshToken.findUnique({ where: { tokenHash } });

export const deleteRefreshToken = (tokenHash) =>
  prisma.refreshToken.deleteMany({ where: { tokenHash } });

export const deleteAllRefreshTokensByUserId = (userId) =>
  prisma.refreshToken.deleteMany({ where: { userId } });

export const findOAuthAccount = (provider, providerAccountId) =>
  prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: { user: { include: { point: true } } },
  });

export const createOAuthUser = ({
  email,
  nickname,
  provider,
  providerAccountId,
}) =>
  prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, nickname },
    });

    await tx.oAuthAccount.create({
      data: { userId: user.id, provider, providerAccountId },
    });

    await tx.point.create({
      data: { userId: user.id, balance: SIGNUP_POINTS },
    });

    await tx.pointHistory.create({
      data: {
        userId: user.id,
        amount: SIGNUP_POINTS,
        reason: 'SIGN_UP',
        description: '회원가입 축하 포인트',
      },
    });

    return user;
  });

export const linkOAuthAccount = (userId, provider, providerAccountId) =>
  prisma.oAuthAccount.create({
    data: { userId, provider, providerAccountId },
  });
