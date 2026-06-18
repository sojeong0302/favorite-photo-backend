import { ERROR_CODES } from '../constants/errorCodes.js';
import saleService from '../services/sale.service.js';
import AppError from '../utils/AppError.js';

export const createSale = async (req, res, next) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED());
    }
    console.log('req.body:', req.body);
    const {
      photoCardId,
      price,
      quantity,
      exchangeGrade,
      exchangeGenre,
      exchangeDescription,
    } = req.body;

    if (!photoCardId || !price || !quantity) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR(
          'photoCardId, price, quantity는 필수 정보입니다.'
        )
      );
    }

    if (price <= 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR('가격은 1원 이상이어야 합니다.')
      );
    }

    if (quantity <= 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR('수량은 1개 이상이어야 합니다.')
      );
    }

    const response = await saleService.createSale({
      photoCardId: Number(photoCardId),
      price: Number(price),
      quantity: Number(quantity),
      exchangeGrade,
      exchangeGenre,
      exchangeDescription,
      userId,
    });

    return res.status(201).json({
      data: response,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};

export const modifySale = async (req, res, next) => {
  try {
    const { saleId } = req.params;
    const userId = req.user.id;
    const { photoCardId, data } = req.body;

    const response = await saleService.modifySale({
      saleId: Number(saleId),
      photoCardId: Number(photoCardId),
      userId,
      data,
    });

    return res.status(200).json({
      data: response,
      message: 'success',
    });
  } catch (error) {
    next(error);
  }
};

export const cancelSale = async (req, res, next) => {
  try {
    const { saleId } = req.params;
    const userId = req.user.id;

    await saleService.cancelSale({
      saleId: Number(saleId),
      userId,
    });

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const saleController = {
  createSale,
  modifySale,
  cancelSale,
};

export default saleController;
