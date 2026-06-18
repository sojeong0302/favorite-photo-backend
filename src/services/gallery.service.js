import { CardGrade } from '@prisma/client';
import prisma from '../configs/prisma.js';
import AppError from '../utils/AppError.js';

const GRADES = ['COMMON', 'RARE', 'SUPER_RARE', 'LEGENDARY'];

const ALLOWED_GENRES = [
  'ALBUM',
  'SPECIAL',
  'FAN_SIGN',
  'SEASON_GREETING',
  'FAN_MEETING',
  'CONCERT',
  'MD',
  'COLLAB',
  'FANCLUB',
  'ETC',
];

const getMonthlyCreatePeriod = () => {
  const now = new Date();

  return {
    startOfMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    startOfNextMonth: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
};

const getMonthlyCreateCount = async (userId) => {
  const { startOfMonth, startOfNextMonth } = getMonthlyCreatePeriod();

  return prisma.photoCard.count({
    where: {
      creatorId: userId,
      createdAt: {
        gte: startOfMonth,
        lt: startOfNextMonth,
      },
    },
  });
};

export const getMyCardsService = async ({
  userId,
  keyword,
  grade,
  genre,
  page,
  limit,
  sort,
}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(keyword && {
      name: {
        contains: keyword,
        mode: 'insensitive',
      },
    }),
    ...(grade && { grade }),
    ...(genre && { genre }),
    cardCopies: {
      some: {
        ownerId: userId,
      },
    },
  };

  const countWhere = {
    cardCopies: {
      some: {
        ownerId: userId,
      },
    },
  };

  let orderBy;

  switch (sort) {
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'priceAsc':
      orderBy = { initialPrice: 'asc' };
      break;
    case 'priceDesc':
      orderBy = { initialPrice: 'desc' };
      break;
    case 'latest':
    default:
      orderBy = { createdAt: 'desc' };
      break;
  }

  const [cards, totalCount, allCardsForCount] = await Promise.all([
    prisma.photoCard.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        grade: true,
        genre: true,
        initialPrice: true,
        createdAt: true,
        creator: {
          select: {
            nickname: true,
          },
        },
        cardCopies: {
          where: {
            ownerId: userId,
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
    }),

    prisma.photoCard.count({ where }),

    prisma.photoCard.findMany({
      where: countWhere,
      select: {
        grade: true,
        cardCopies: {
          where: {
            ownerId: userId,
          },
          select: {
            id: true,
          },
        },
      },
    }),
  ]);

  const counts = {};

  allCardsForCount.forEach((card) => {
    counts[card.grade] = (counts[card.grade] || 0) + card.cardCopies.length;
  });

  const gradeCount = GRADES.map((grade) => ({
    grade,
    count: counts[grade] || 0,
  }));

  const totalCopyCount = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0
  );

  const formattedCards = cards.map((card) => ({
    id: card.id,
    photoCardId: card.id,
    cardCopyId: card.cardCopies[0]?.id ?? null,
    name: card.name,
    imageUrl: card.imageUrl,
    grade: card.grade,
    genre: card.genre,
    creatorNickname: card.creator.nickname,
    initialPrice: card.initialPrice,
    price: card.initialPrice,
    createdAt: card.createdAt,
    quantity: card.cardCopies.length,
    count: card.cardCopies.length,
  }));

  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;

  return {
    items: formattedCards,
    gradeCount,
    meta: {
      page,
      limit,
      totalCount,
      totalCopyCount,
      totalPages,
      hasNextPage,
    },
  };
};

export const postMyCardsService = async ({
  userId,
  name,
  description,
  imageUrl,
  grade,
  genre,
  initialPrice,
  totalQuantity,
}) => {
  if (!name) {
    throw new AppError(400, 'MISSING_NAME', '카드 이름을 입력해 주세요.');
  }

  if (!imageUrl) {
    throw new AppError(400, 'MISSING_IMAGE_URL', '이미지 URL을 입력해 주세요.');
  }

  if (!grade) {
    throw new AppError(400, 'MISSING_GRADE', '등급을 입력해 주세요.');
  }

  if (!GRADES.includes(grade)) {
    throw new AppError(400, 'INVALID_GRADE', '유효하지 않은 등급입니다.');
  }

  if (!genre) {
    throw new AppError(400, 'MISSING_GENRE', '장르를 입력해 주세요.');
  }

  if (!ALLOWED_GENRES.includes(genre)) {
    throw new AppError(400, 'INVALID_GENRE', '유효하지 않은 장르입니다.');
  }

  if (!description) {
    throw new AppError(
      400,
      'MISSING_DESCRIPTION',
      '카드 설명을 입력해 주세요.'
    );
  }

  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
    throw new AppError(
      400,
      'INVALID_TOTAL_QUANTITY',
      '발행 수량은 1개 이상이어야 합니다.'
    );
  }

  if (totalQuantity > 10) {
    throw new AppError(
      400,
      'TOTAL_QUANTITY_LIMIT_EXCEEDED',
      '카드는 최대 10장까지 발행할 수 있습니다.'
    );
  }

  if (!Number.isInteger(initialPrice) || initialPrice <= 0) {
    throw new AppError(
      400,
      'INVALID_INITIAL_PRICE',
      '초기 가격은 1 이상이어야 합니다.'
    );
  }

  const monthlyCreateCount = await getMonthlyCreateCount(userId);

  if (monthlyCreateCount >= 3) {
    throw new AppError(ERROR_CODES.MONTHLY_CREATE_LIMIT_EXCEEDED());
  }

  const result = await prisma.$transaction(async (tx) => {
    const photoCard = await tx.photoCard.create({
      data: {
        name,
        description,
        imageUrl,
        grade,
        genre,
        totalQuantity,
        initialPrice,
        creatorId: userId,
      },
    });

    const cardCopies = Array.from({ length: totalQuantity }, (_, index) => ({
      photoCardId: photoCard.id,
      ownerId: userId,
      status: 'OWNED',
      serialNumber: `CARD-${photoCard.id}-${String(index + 1).padStart(3, '0')}`,
    }));

    await tx.cardCopy.createMany({
      data: cardCopies,
    });

    return photoCard;
  });

  return {
    id: result.id,
    name: result.name,
    description: result.description,
    imageUrl: result.imageUrl,
    grade: result.grade,
    genre: result.genre,
    totalQuantity: result.totalQuantity,
    initialPrice: result.initialPrice,
    creatorId: result.creatorId,
    createdAt: result.createdAt,
    monthlyCreateCount: monthlyCreateCount + 1,
  };
};

export const getMyTradesService = async ({
  userId,
  keyword,
  grade,
  genre,
  tradeType,
  isSoldOut,
  page,
  limit,
  sort,
}) => {
  const skip = (page - 1) * limit;

  let orderBy;

  switch (sort) {
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'priceAsc':
      orderBy = { price: 'asc' };
      break;
    case 'priceDesc':
      orderBy = { price: 'desc' };
      break;
    case 'latest':
    default:
      orderBy = { createdAt: 'desc' };
      break;
  }

  const photoCardWhere = {
    ...(keyword && {
      name: {
        contains: keyword,
        mode: 'insensitive',
      },
    }),
    ...(grade && { grade }),
    ...(genre && { genre }),
  };

  const parsedIsSoldOut =
    isSoldOut === undefined
      ? undefined
      : isSoldOut === 'true' || isSoldOut === true;

  const saleStatusWhere =
    parsedIsSoldOut === undefined
      ? { in: ['ON_SALE', 'SOLD_OUT', 'CANCELED'] }
      : parsedIsSoldOut
        ? 'SOLD_OUT'
        : 'ON_SALE';

  let sales = [];
  let exchangeProposals = [];

  if (!tradeType || tradeType === 'SALE') {
    sales = await prisma.sale.findMany({
      where: {
        sellerId: userId,
        status: saleStatusWhere,
        photoCard: photoCardWhere,
      },
      include: {
        photoCard: {
          include: {
            creator: {
              select: {
                nickname: true,
              },
            },
          },
        },
        saleItems: {
          include: {
            purchaseItem: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });
  }

  if (!tradeType || tradeType === 'EXCHANGE') {
    exchangeProposals = await prisma.exchangeProposal.findMany({
      where: {
        proposerId: userId,
        status: 'PENDING',
        offeredCardCopy: {
          photoCard: photoCardWhere,
        },
      },
      include: {
        offeredCardCopy: {
          include: {
            photoCard: {
              include: {
                creator: {
                  select: {
                    nickname: true,
                  },
                },
              },
            },
          },
        },
        sale: {
          select: {
            id: true,
            price: true,
            status: true,
            photoCard: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    });
  }

  const formattedSales = getFormattedSales({ sales });
  const formattedExchanges = getFormattedExchanges({ exchangeProposals });

  const items = [...formattedSales, ...formattedExchanges].sort((a, b) => {
    if (sort === 'oldest') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }

    if (sort === 'priceAsc') {
      return a.price - b.price;
    }

    if (sort === 'priceDesc') {
      return b.price - a.price;
    }

    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  //Grade 통계를 위한, 전체 목록 가져오기
  let totalSalesGrades = [];
  let totalExchangeProposalsGrades = [];
  if (!tradeType || tradeType === 'SALE') {
    const totalSales = await prisma.sale.findMany({
      where: {
        sellerId: userId,
        status: saleStatusWhere,
        photoCard: photoCardWhere,
      },
      select: { photoCard: { select: { grade: true } } },
    });
    totalSalesGrades = totalSales
      .map((sale) => sale.photoCard?.grade)
      .filter(Boolean);
  }
  if (!tradeType || tradeType === 'EXCHANGE') {
    const totalExchangeProposals = await prisma.exchangeProposal.findMany({
      where: {
        proposerId: userId,
        status: 'PENDING',
        offeredCardCopy: {
          photoCard: photoCardWhere,
        },
      },
      select: {
        offeredCardCopy: { select: { photoCard: { select: { grade: true } } } },
      },
    });
    totalExchangeProposalsGrades = totalExchangeProposals
      .map((ex) => ex.offeredCardCopy?.photoCard?.grade)
      .filter(Boolean);
  }
  const totalItemsGrades = [
    ...totalSalesGrades,
    ...totalExchangeProposalsGrades,
  ];

  //meta 통계 정보
  const totalCount = totalItemsGrades.length;
  const totalPages = Math.ceil(totalItemsGrades.length / limit);
  const hasNextPage = page < totalPages;

  return {
    items,
    meta: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage,
      gradeStats: [
        {
          grade: CardGrade.COMMON,
          count: totalItemsGrades.filter((item) => item === CardGrade.COMMON)
            .length,
        },
        {
          grade: CardGrade.RARE,
          count: totalItemsGrades.filter((item) => item === CardGrade.RARE)
            .length,
        },
        {
          grade: CardGrade.SUPER_RARE,
          count: totalItemsGrades.filter(
            (item) => item === CardGrade.SUPER_RARE
          ).length,
        },
        {
          grade: CardGrade.LEGENDARY,
          count: totalItemsGrades.filter((item) => item === CardGrade.LEGENDARY)
            .length,
        },
      ],
    },
  };
};

const getFormattedSales = ({ sales }) => {
  return sales.map((sale) => {
    const activeSaleItems = sale.saleItems.filter((item) => !item.purchaseItem);

    return {
      type: 'SALE',
      saleId: sale.id,
      photoCardId: sale.photoCardId,
      name: sale.photoCard.name,
      imageUrl: sale.photoCard.imageUrl,
      grade: sale.photoCard.grade,
      genre: sale.photoCard.genre,
      creatorNickname: sale.photoCard.creator.nickname,
      quantity: activeSaleItems.length,
      count: activeSaleItems.length,
      status: sale.status,
      statusLabel: sale.status === 'SOLD_OUT' ? '판매 완료' : '판매 중',
      price: sale.price,
      createdAt: sale.createdAt,
    };
  });
};

const getFormattedExchanges = ({ exchangeProposals }) => {
  return exchangeProposals.map((proposal) => {
    const photoCard = proposal.offeredCardCopy.photoCard;

    return {
      type: 'EXCHANGE',
      proposalId: proposal.id,
      saleId: proposal.saleId,
      photoCardId: photoCard.id,
      cardCopyId: proposal.offeredCardCopyId,
      name: photoCard.name,
      imageUrl: photoCard.imageUrl,
      grade: photoCard.grade,
      genre: photoCard.genre,
      creatorNickname: photoCard.creator.nickname,
      quantity: 1,
      count: 1,
      status: proposal.status,
      statusLabel: '교환 대기',
      price: proposal.sale.price,
      targetCardName: proposal.sale.photoCard.name,
      createdAt: proposal.createdAt,
    };
  });
};

export const getMyCardCreateStatusService = async ({ userId }) => {
  const monthlyCreateCount = await getMonthlyCreateCount(userId);

  const monthlyCreateLimit = 3;

  const { startOfMonth } = getMonthlyCreatePeriod();

  return {
    year: startOfMonth.getFullYear(),
    month: startOfMonth.getMonth() + 1,
    monthlyCreateCount,
    monthlyCreateLimit,
    remainingCreateCount: Math.max(monthlyCreateLimit - monthlyCreateCount, 0),
    canCreate: monthlyCreateCount < monthlyCreateLimit,
  };
};
