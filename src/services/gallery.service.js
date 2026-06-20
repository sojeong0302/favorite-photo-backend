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

  console.log('[입력]', {
    userId,
    tradeType,
    grade,
    genre,
    keyword,
    isSoldOut,
    page,
    limit,
    sort,
  });

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
  //console.log('[photoCardWhere]', photoCardWhere);

  const parsedIsSoldOut =
    isSoldOut === undefined
      ? undefined
      : isSoldOut === 'true' || isSoldOut === true;
  //console.log('[parsedIsSoldOut]', parsedIsSoldOut);

  const saleStatusWhere =
    parsedIsSoldOut === undefined
      ? { in: ['ON_SALE', 'SOLD_OUT'] }
      : parsedIsSoldOut
        ? 'SOLD_OUT'
        : 'ON_SALE';
  //console.log('[saleStatusWhere]', saleStatusWhere);

  //Sales와 Exchanges를 한 쿼리로 받아와야 함.
  //현재는, 기본상태일 때의 값을 SALE과 EXCHANGE각각 따로 가져오는데 -> 기본 상태일 때, 아예 다른 쿼리로 가져오도록 수정이 필요.

  let items = [];

  //기본 상태라면
  //정렬 기준은 항상 고정되어있으니까 그냥 변수로 안넣음. 나중에 필요하면 추가..
  if (!tradeType) {
    const saleStatusSQL =
      parsedIsSoldOut === undefined
        ? `s."status" IN ('ON_SALE', 'SOLD_OUT')`
        : parsedIsSoldOut
          ? `s."status" = 'SOLD_OUT'`
          : `s."status" = 'ON_SALE'`;
    //console.log('[saleStatusSQL]', saleStatusSQL);
    let tradesRaw = [];
    try {
      tradesRaw = await prisma.$queryRawUnsafe(
        `
      SELECT * FROM(
        SELECT s.id, 'SALE' AS type, s."createdAt"
        FROM "Sale" s
        JOIN "PhotoCard" pc ON s."photoCardId" = pc.id
        WHERE s."sellerId" = $1 
          AND ${saleStatusSQL} 
          AND ($2::text IS NULL OR pc."grade" = $2::"CardGrade")
          AND ($3::text IS NULL OR pc."genre" = $3::"CardGenre")
          AND ($4::text IS NULL OR pc."name" ILIKE '%' || $4 || '%')
        
        UNION ALL
        
        SELECT ep.id, 'EXCHANGE' AS type, ep."createdAt"
        FROM "ExchangeProposal" ep
        JOIN "CardCopy" cc ON ep."offeredCardCopyId" = cc.id
        JOIN "PhotoCard" pc ON cc."photoCardId" = pc.id
        WHERE ep."proposerId" = $1 
          AND ep."status" = 'PENDING'
          AND ($2::text IS NULL OR pc."grade" = $2::"CardGrade")
          AND ($3::text IS NULL OR pc."genre" = $3::"CardGenre")
          AND ($4::text IS NULL OR pc."name" ILIKE '%' || $4 || '%')
      ) AS trades
      ORDER BY "createdAt" DESC
      LIMIT $5 OFFSET $6;
    `,
        userId,
        grade ?? null,
        genre ?? null,
        keyword ?? null,
        limit,
        skip
      );
      //console.log('[tradesRaw]', tradesRaw);
    } catch (e) {
      //console.log('[error]', e);
    }

    //tradesRaw에서 sale, exchange 분리
    const saleIds = tradesRaw
      .filter((trade) => trade.type === 'SALE')
      .map((sale) => Number(sale.id));
    const exchangeIds = tradesRaw
      .filter((trade) => trade.type === 'EXCHANGE')
      .map((exchange) => Number(exchange.id));
    //sale에 대해, 데이터 가져오기
    const sales = await prisma.sale.findMany({
      where: { id: { in: saleIds } },
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
    });
    //exchange에 대해, 데이터 가져오기
    const exchanges = await prisma.exchangeProposal.findMany({
      where: {
        id: { in: exchangeIds },
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
    });
    //이걸 포맷팅 해서 반환
    const formattedSales = getFormattedSales({ sales });
    const formattedExchanges = getFormattedExchanges({
      exchangeProposals: exchanges,
    });
    //가져온 데이터를 trades로 합치기 & 정렬
    items = [...formattedSales, ...formattedExchanges].sort((a, b) => {
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
  }

  // let sales = [];
  // let exchangeProposals = [];

  //SALE만이라면
  if (tradeType === 'SALE') {
    const sales = await prisma.sale.findMany({
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

    const formattedSales = getFormattedSales({ sales });

    items = formattedSales;
  }

  //EXCHANGE만이라면
  if (tradeType === 'EXCHANGE') {
    const exchangeProposals = await prisma.exchangeProposal.findMany({
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

    const formattedExchanges = getFormattedExchanges({ exchangeProposals });

    items = formattedExchanges;
  }

  //---Grade 통계 파트---
  //Grade 통계를 위한, 전체 목록 (grade만) 가져오기
  let totalSalesGrades = [];
  let totalExchangeProposalsGrades = [];
  if (!tradeType || tradeType === 'SALE') {
    const totalSales = await prisma.sale.findMany({
      where: {
        sellerId: userId,
        status: { in: ['ON_SALE', 'SOLD_OUT'] }, //isSoldOut이 undefined일 때의 조건과 같음. (기본 상태)
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
      quantity: activeSaleItems.length,
      count: activeSaleItems.length,
      status: sale.status,
      statusLabel: sale.status === 'SOLD_OUT' ? '판매 완료' : '판매 중',
      price: sale.price,
      createdAt: sale.createdAt,
      creator: {
        nickname: sale.photoCard.creator.nickname,
      },
      /*creatorNickname: sale.photoCard.creator.nickname,*/
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
      quantity: 1,
      count: 1,
      status: proposal.status,
      statusLabel: '교환 대기',
      price: proposal.sale.price,
      targetCardName: proposal.sale.photoCard.name,
      createdAt: proposal.createdAt,
      creator: {
        nickname: photoCard.creator.nickname,
      },
      /*creatorNickname: sale.photoCard.creator.nickname,*/
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
