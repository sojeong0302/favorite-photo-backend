import * as authRepository from '../repositories/authRepository.js';
import { hashPassword, verifyPassword, hashToken } from '../utils/hash.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import AppError from '../utils/AppError.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { SIGNUP_POINTS } from '../constants/points.js';

const REFRESH_EXPIRES_DAYS = 7;

const generateTokens = async (userId) => {
  const accessToken = signAccessToken({ userId });
  const refreshToken = signRefreshToken({ userId });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS);

  await authRepository.createRefreshToken({
    userId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
};

const validateRegisterInput = ({ email, nickname, password }) => {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(ERROR_CODES.INVALID_EMAIL());
  }

  if (!nickname || nickname.length < 2 || nickname.length > 12) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR(
        '닉네임은 2자 이상 12자 이하로 입력해 주세요.'
      )
    );
  }

  if (!password || password.length < 8) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('비밀번호는 8자 이상 입력해 주세요.')
    );
  }
};

export const register = async ({ email, nickname, password }) => {
  validateRegisterInput({ email, nickname, password });

  const [existingEmail, existingNickname] = await Promise.all([
    authRepository.findUserByEmail(email),
    authRepository.findUserByNickname(nickname),
  ]);

  if (existingEmail) {
    throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS());
  }

  if (existingNickname) {
    throw new AppError(ERROR_CODES.NICKNAME_ALREADY_EXISTS());
  }

  const hashedPassword = await hashPassword(password);

  const user = await authRepository.createUserWithPoint({
    email,
    nickname,
    password: hashedPassword,
  });

  const tokens = await generateTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      point: SIGNUP_POINTS,
    },
    ...tokens,
  };
};

export const login = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR('이메일과 비밀번호를 입력해 주세요.')
    );
  }

  const user = await authRepository.findUserByEmail(email);

  if (!user || !user.password) {
    throw new AppError(ERROR_CODES.LOGIN_FAILED());
  }

  const isValid = await verifyPassword(password, user.password);

  if (!isValid) {
    throw new AppError(ERROR_CODES.LOGIN_FAILED());
  }

  const userWithPoint = await authRepository.findUserWithPoint(user.id);
  const tokens = await generateTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      point: userWithPoint?.point?.balance ?? 0,
    },
    ...tokens,
  };
};

export const refresh = async (incomingToken) => {
  if (!incomingToken) {
    throw new AppError(ERROR_CODES.NO_REFRESH_TOKEN());
  }

  let payload;

  try {
    payload = verifyRefreshToken(incomingToken);
  } catch {
    throw new AppError(ERROR_CODES.INVALID_REFRESH_TOKEN());
  }

  const tokenHash = hashToken(incomingToken);
  const stored = await authRepository.findRefreshToken(tokenHash);

  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError(ERROR_CODES.REFRESH_TOKEN_EXPIRED());
  }

  await authRepository.deleteRefreshToken(tokenHash);

  return generateTokens(payload.userId);
};

export const googleOAuthComplete = async ({
  providerAccountId,
  email,
  nickname,
  provider = 'GOOGLE',
}) => {
  if (!nickname || nickname.length < 2 || nickname.length > 12) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR(
        '닉네임은 2자 이상 12자 이하로 입력해 주세요.'
      )
    );
  }

  const existingNickname = await authRepository.findUserByNickname(nickname);

  if (existingNickname) {
    throw new AppError(ERROR_CODES.NICKNAME_ALREADY_EXISTS());
  }

  const user = await authRepository.createOAuthUser({
    email,
    nickname,
    provider,
    providerAccountId,
  });

  const tokens = await generateTokens(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      point: SIGNUP_POINTS,
    },
    ...tokens,
  };
};

export const logout = async (incomingToken) => {
  if (!incomingToken) return;

  const tokenHash = hashToken(incomingToken);

  await authRepository.deleteRefreshToken(tokenHash).catch(() => {});
};
