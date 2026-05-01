const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');

const { AppModule } = require('../dist/app.module');
const { AudioLibraryService } = require('../dist/audio-library/audio-library.service');

describe('Audio Library (e2e)', () => {
  let app;

  const audioServiceMock = {
    listBooksForMobile: async () => [
      {
        id: '00000000-0000-0000-0000-000000000001',
        title: 'Test book',
        coverUrl: null,
        description: null,
        chaptersCount: 1,
      },
    ],
    getBookDetailForMobile: async () => ({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Test book',
      coverUrl: null,
      description: null,
      chapters: [
        {
          id: '00000000-0000-0000-0000-000000000011',
          title: 'Chapter 1',
          order: 1,
          bookId: '00000000-0000-0000-0000-000000000001',
          paragraphs: [
            {
              id: '00000000-0000-0000-0000-000000000111',
              text: 'P1',
              order: 1,
              chapterId: '00000000-0000-0000-0000-000000000011',
              audioUrl: 'https://example.com/a.mp3',
            },
          ],
        },
      ],
    }),
    adminListBooks: async () => [
      {
        id: '00000000-0000-0000-0000-000000000001',
        title: 'Test book',
        coverUrl: null,
        description: null,
        isActive: true,
        chaptersCount: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    adminGetBook: async () => ({
      id: '00000000-0000-0000-0000-000000000001',
      title: 'Test book',
      coverUrl: null,
      description: null,
      isActive: true,
      chapters: [],
    }),
    adminCreateBook: async (body) => ({
      id: '00000000-0000-0000-0000-000000000002',
      title: body.title,
      coverUrl: body.coverUrl ?? null,
      description: body.description ?? null,
      isActive: body.isActive ?? true,
      chapters: [],
    }),
  };

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AudioLibraryService)
      .useValue(audioServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  it('GET /audio-books returns list', async () => {
    const res = await request(app.getHttpServer()).get('/audio-books').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('00000000-0000-0000-0000-000000000001');
    expect(res.body[0].chaptersCount).toBe(1);
  });

  it('GET /audio-books/:id returns detail with paragraphs', async () => {
    const res = await request(app.getHttpServer())
      .get('/audio-books/00000000-0000-0000-0000-000000000001')
      .expect(200);
    expect(res.body.id).toBe('00000000-0000-0000-0000-000000000001');
    expect(res.body.chapters[0].paragraphs[0].audioUrl).toBe('https://example.com/a.mp3');
  });

  it('POST /admin/audio-books validates body (missing title => 400)', async () => {
    await request(app.getHttpServer()).post('/admin/audio-books').send({}).expect(400);
  });

  it('POST /admin/audio-books creates book when valid', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/audio-books')
      .send({ title: 'My audio book', isActive: true })
      .expect(201);
    expect(res.body.id).toBe('00000000-0000-0000-0000-000000000002');
    expect(res.body.title).toBe('My audio book');
  });
});

