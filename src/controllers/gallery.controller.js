import {
  getMyCardsService,
  postMyCardsService,
  getMyTradesService,
  getMyCardCreateStatusService,
} from '../services/gallery.service.js';
import AppError from '../utils/AppError.js';
import cloudinary from '../configs/cloudinary.js';

export const getMyCards = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      keyword,
      grade,
      genre,
      page = 1,
      limit = 15,
      sort = 'latest',
    } = req.query;

    const result = await getMyCardsService({
      userId,
      keyword,
      grade,
      genre,
      page: Number(page),
      limit: Number(limit),
      sort,
    });

    return res.status(200).json({
      data: result,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};

export const postMyCards = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      throw new AppError(400, 'FILE_REQUIRED', '파일을 등록해 주세요.');
    }

    const { name, description, grade, genre, initialPrice, totalQuantity } =
      req.body;

    const uploadResult = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    );

    const imageUrl = uploadResult.secure_url;

    const result = await postMyCardsService({
      userId,
      name,
      description,
      imageUrl,
      grade,
      genre,
      initialPrice: Number(initialPrice),
      totalQuantity: Number(totalQuantity),
    });

    return res.status(201).json({
      data: result,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};

export const getMyTrades = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      keyword,
      grade,
      genre,
      tradeType,
      isSoldOut,
      page = 1,
      limit = 15,
      sort = 'latest',
    } = req.query;

    const result = await getMyTradesService({
      userId,
      keyword: keyword || undefined,
      grade: grade || undefined,
      genre: genre || undefined,
      tradeType: tradeType || undefined,
      isSoldOut: isSoldOut || undefined,
      page: Number(page),
      limit: Number(limit),
      sort,
    });

    return res.status(200).json({
      data: result,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};

export const getMyCardCreateStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await getMyCardCreateStatusService({ userId });

    return res.status(200).json({
      data: result,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};
