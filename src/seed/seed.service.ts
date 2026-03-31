import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { QuestionType } from '../common/enums/question-type.enum';

type QSeed = {
  prompt: string;
  type: QuestionType;
  options: { text: string; correct: boolean; match?: string }[];
};

type TheorySeed = {
  title: string;
  content: string;
  questions: QSeed[];
};

type ModuleSeed = {
  title: string;
  theories: TheorySeed[];
};

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory) private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepo: Repository<QuestionOption>,
  ) {}

  async seedAll() {
    const modules = this.getData();
    let createdModules = 0;
    let createdTheories = 0;
    let createdQuestions = 0;
    let createdOptions = 0;
    let skippedModules = 0;
    let skippedTheories = 0;
    let skippedQuestions = 0;
    let skippedOptions = 0;

    for (let mi = 0; mi < modules.length; mi++) {
      const mod = modules[mi];
      let level = await this.levelRepo.findOne({
        where: { title: mod.title },
      });
      if (!level) {
        level = await this.levelRepo.save(
          this.levelRepo.create({
            title: mod.title,
            orderIndex: mi,
            isActive: true,
          }),
        );
        createdModules++;
      } else {
        skippedModules++;
        // Safety: do not overwrite existing content; only normalize minimal metadata.
        const nextOrderIndex = level.orderIndex ?? mi;
        const nextIsActive = level.isActive ?? true;
        if (level.orderIndex !== nextOrderIndex || level.isActive !== nextIsActive) {
          await this.levelRepo.update(
            { id: level.id },
            { orderIndex: nextOrderIndex, isActive: nextIsActive },
          );
          level = { ...level, orderIndex: nextOrderIndex, isActive: nextIsActive };
        }
      }

      for (let ti = 0; ti < mod.theories.length; ti++) {
        const th = mod.theories[ti];
        let theory = await this.theoryRepo.findOne({
          where: { levelId: level.id, title: th.title },
        });
        if (!theory) {
          theory = await this.theoryRepo.save(
            this.theoryRepo.create({
              levelId: level.id,
              title: th.title,
              orderIndex: ti,
              content: th.content,
            }),
          );
          createdTheories++;
        } else {
          skippedTheories++;
          // Keep old content as-is; only fill if empty and normalize ordering.
          const updates: Partial<Theory> = {};
          if ((theory.content ?? '').trim().length === 0 && th.content.trim().length > 0) {
            updates.content = th.content;
          }
          if (theory.orderIndex !== ti) updates.orderIndex = theory.orderIndex ?? ti;
          if (Object.keys(updates).length > 0) {
            await this.theoryRepo.update({ id: theory.id }, updates);
            theory = { ...theory, ...updates };
          }
        }

        for (let qi = 0; qi < th.questions.length; qi++) {
          const q = th.questions[qi];
          let question = await this.questionRepo.findOne({
            where: { theoryId: theory.id, prompt: q.prompt },
          });
          if (!question) {
            question = await this.questionRepo.save(
              this.questionRepo.create({
                levelId: level.id,
                theoryId: theory.id,
                prompt: q.prompt,
                type: q.type,
                orderIndex: qi,
                isActive: true,
              }),
            );
            createdQuestions++;
          } else {
            skippedQuestions++;
            // Do not rewrite prompts/options; only ensure active flag.
            if (question.isActive !== true) {
              await this.questionRepo.update({ id: question.id }, { isActive: true });
              question = { ...question, isActive: true };
            }
          }

          for (let oi = 0; oi < q.options.length; oi++) {
            const o = q.options[oi];
            const existingOpt = await this.optionRepo.findOne({
              where: { questionId: question.id, optionText: o.text },
            });
            if (existingOpt) {
              skippedOptions++;
              continue;
            }
            await this.optionRepo.save(
              this.optionRepo.create({
                questionId: question.id,
                optionText: o.text,
                isCorrect: o.correct,
                matchText: o.match ?? null,
                orderIndex: oi,
              }),
            );
            createdOptions++;
          }
        }
      }
    }

    return {
      success: true,
      message: 'Seed/Update muvaffaqiyatli (idempotent)',
      stats: {
        modules: modules.length,
        created: {
          modules: createdModules,
          theories: createdTheories,
          questions: createdQuestions,
          options: createdOptions,
        },
        skipped: {
          modules: skippedModules,
          theories: skippedTheories,
          questions: skippedQuestions,
          options: skippedOptions,
        },
      },
    };
  }

  private getData(): ModuleSeed[] {
    const SC = QuestionType.SINGLE_CHOICE;
    const YN = QuestionType.YES_NO;
    const MA = QuestionType.MATCHING;

    return [
      // ──────────────────────────────────────────
      // 1-MODUL: SHAXSIY XAVFSIZLIK
      // ──────────────────────────────────────────
      {
        title: '1-Modul: Shaxsiy xavfsizlik',
        theories: [
          {
            title: '1.1-dars: Shaxsiy himoya vositalari (SHHV) va ularni tanlash',
            content: `Ushbu darsda xodim har bir uskunaning vazifasini va ularsiz ishga kirishishning oqibatlarini o'rganadi.\n\nElektr qurilmalarida ishlayotganda xodimni uchta asosiy xavfdan himoya qilish kerak:\n• Elektr toki urishi\n• Elektr yoyi (termik ta'sir)\n• Mexanik shikastlanishlar\n\nAsosiy SHHV: Himoya kaskasi, Dielektrik qo'lqop, Maxsus kiyim, Himoya ko'zoynagi, Dielektrik botinka/gilamcha.\n\nDielektrik qo'lqoplarning sinov muddati — 6 oyda bir marta.`,
            questions: [
              {
                prompt: '110 kVli podstansiyada ishlash uchun 3 xil qo\'lqopdan qaysi biri mos keladi?',
                type: SC,
                options: [
                  { text: 'Oddiy qurilish qo\'lqopi', correct: false },
                  { text: 'Rezina xo\'jalik qo\'lqopi', correct: false },
                  { text: '"EN" belgisi tushirilgan dielektrik qo\'lqop', correct: true },
                ],
              },
              {
                prompt: 'Dielektrik qo\'lqopda igna uchidek teshik topsangiz nima qilasiz?',
                type: SC,
                options: [
                  { text: 'Izolyatsiya tasmasi bilan yopishtirib ishlayman', correct: false },
                  { text: 'Teshik kichkina, xavfi yo\'q deb hisoblayman', correct: false },
                  { text: 'Foydalanishni darhol to\'xtataman va yaroqsizga chiqaraman', correct: true },
                ],
              },
              {
                prompt: 'Sintetik (neylon, poliester) kiyimda podstansiyaga kirish taqiqlanadi',
                type: YN,
                options: [
                  { text: 'Ha', correct: true },
                  { text: 'Yo\'q', correct: false },
                ],
              },
            ],
          },
          {
            title: '1.2-dars: Himoya vositalarini sinovdan o\'tkazish muddatlari',
            content: `Elektr xavfsizligi vositalari tasnifi:\n• Asosiy himoya vositalari: operativ shtangalar, kuchlanish ko'rsatkichlari\n• Qo'shimcha himoya vositalari: dielektrik botinkalar, gilamchalar\n\nSinov muddatlari:\nDielektrik qo'lqoplar — 6 oyda 1 marta\nOperativ shtangalar — 24 oyda 1 marta\nKuchlanish ko'rsatkichlari — 12 oyda 1 marta\nIzolyatsiyalovchi qisqichlar — 24 oyda 1 marta\nDielektrik botinkalar — 36 oyda 1 marta`,
            questions: [
              {
                prompt: 'Sinov muddatlarini mos vositaga biriktiring',
                type: MA,
                options: [
                  { text: 'Qo\'lqop', correct: true, match: '6 oy' },
                  { text: 'Indikator', correct: true, match: '12 oy' },
                  { text: 'Shtanga', correct: true, match: '24 oy' },
                  { text: 'Botinka', correct: true, match: '36 oy' },
                ],
              },
              {
                prompt: 'Himoya vositasi yerga tushib ketsa, sinov muddati tugamagan bo\'lsa ham navbatdan tashqari sinovdan o\'tkazilishi shart',
                type: YN,
                options: [
                  { text: 'Ha', correct: true },
                  { text: 'Yo\'q', correct: false },
                ],
              },
              {
                prompt: 'Dielektrik gilamchalar har 6 oyda laboratoriya sinovidan o\'tkazilishi shart',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
            ],
          },
          {
            title: '1.3-dars: Xavfsizlik plakatlari va belgilari',
            content: `Plakatlar 4 ta asosiy guruhga bo'linadi:\n• Taqiqlovchi (Qizil/Oq) — YOQMANG! Odamlar ishlayapti\n• Ogohlantiruvchi (Sariq/Qora) — TO'XTANG! Kuchlanish\n• Buyuruvchi (Ko'k/Oq) — SHU YERDA ISHLANG\n• Ko'rsatuvchi (Yashil/Oq) — YERLATILGAN\n\n"YOQMANG! Odamlar ishlayapti" plakati ilingan klyuchni hech kim burashga haqli emas!`,
            questions: [
              {
                prompt: '220 kVli ajratgich ochildi. Qaysi plakat ilinadi?',
                type: SC,
                options: [
                  { text: 'Shu yerga chiqing', correct: false },
                  { text: 'YOQMANG! Odamlar ishlayapti', correct: true },
                  { text: 'YERLATILGAN', correct: false },
                ],
              },
              {
                prompt: 'Plakatlar ranglarini mos guruhga biriktiring',
                type: MA,
                options: [
                  { text: 'Qizil plakat', correct: true, match: 'Taqiqlash' },
                  { text: 'Sariq plakat', correct: true, match: 'Ogohlantirish' },
                  { text: 'Ko\'k plakat', correct: true, match: 'Ruxsat etilgan nuqta' },
                  { text: 'Yashil plakat', correct: true, match: 'Xavfsiz holat' },
                ],
              },
            ],
          },
        ],
      },

      // ──────────────────────────────────────────
      // 2-MODUL: PODSTANSIYA HUDUDIDAGI TARTIB-QOIDALAR
      // ──────────────────────────────────────────
      {
        title: '2-Modul: Podstansiya hududidagi tartib-qoidalar',
        theories: [
          {
            title: '2.1-dars: Naryad-ruxsatnoma va Farmoyish',
            content: `Ishlarni tashkil etishning uch usuli:\n• Naryad-ruxsatnoma — murakkab ishlar uchun yozma topshiriq\n• Farmoyish — oddiy, qisqa muddatli ishlar\n• Joriy ekspluatatsiya — doimiy kichik ishlar\n\nNaryad amal muddati: 15 kalendar kuni. Uzaytirish faqat 1 marta. Saqlash muddati: 30 kun. Ikki nusxada yoziladi.`,
            questions: [
              {
                prompt: '110 kVli kabelni almashtirasiz — bu uch kunlik ish. Qaysi hujjat kerak?',
                type: SC,
                options: [
                  { text: 'Farmoyish', correct: false },
                  { text: 'Naryad-ruxsatnoma', correct: true },
                  { text: 'Og\'zaki ruxsat', correct: false },
                ],
              },
              {
                prompt: 'Naryad muddatini ikki marta uzaytirish mumkin',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
              {
                prompt: 'Naryad-ruxsatnomasining amal qilish muddati necha kalendar kuni?',
                type: SC,
                options: [
                  { text: '7 kun', correct: false },
                  { text: '15 kun', correct: true },
                  { text: '30 kun', correct: false },
                ],
              },
            ],
          },
          {
            title: '2.2-dars: Kuchlanish ostidagi qismlargacha xavfsiz masofalar',
            content: `Xavfsiz masofalar:\n1 kV gacha — 0,3 m\n1–35 kV — 0,6 m\n110 kV — 1,0 m\n220 kV — 2,0 m\n500 kV — 3,5 m\n750 kV — 5,0 m\n\nQadam kuchlanishi xavfli radius: simdan 8 metr gacha.`,
            questions: [
              {
                prompt: 'Kuchlanish va xavfsiz masofalarni moslang',
                type: MA,
                options: [
                  { text: '110 kV', correct: true, match: '1,0 m' },
                  { text: '220 kV', correct: true, match: '2,0 m' },
                  { text: '35 kV', correct: true, match: '0,6 m' },
                  { text: '500 kV', correct: true, match: '3,5 m' },
                ],
              },
              {
                prompt: 'Yerga 35 kVli sim tushib yotibdi. Necha metrdan yaqin bormaysiz?',
                type: SC,
                options: [
                  { text: '1 m', correct: false },
                  { text: '3 m', correct: false },
                  { text: '8 m', correct: true },
                  { text: '5 m', correct: false },
                ],
              },
              {
                prompt: 'Yerga tushgan simga faqat tegib ketganda xavf bor',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
            ],
          },
          {
            title: '2.3-dars: Podstansiya hududida harakatlanish qoidalari',
            content: `Ruxsat zonalari:\n• Erkin zona — barcha xodimlar\n• Nazorat ostidagi zona — elektr xavfsizlik guruhiga ega xodimlar\n• Cheklangan zona — faqat ruxsat etilgan brigada a'zolari\n\nQoidalar: yo'laklar bo'ylab yurish, shkaflari eshigi yopiq, yolg'iz kirish taqiqlangan, yugurish taqiqlangan.`,
            questions: [
              {
                prompt: 'Siz II xavfsizlik guruhigasiz. Yolg\'iz 110 kVli ORU ga kirishingiz mumkinmi?',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
              {
                prompt: 'Podstansiyaga kirish to\'g\'ri tartibini tanlang',
                type: SC,
                options: [
                  { text: 'SHHVni kiyish → Topshiriq olish → Kirish', correct: false },
                  { text: 'Topshiriq olish → Naryadni o\'qib imzolash → SHHVni kiyish → Navbatchi bilan birga borish', correct: true },
                  { text: 'Navbatchi bilan borish → Topshiriq olish → SHHVni kiyish', correct: false },
                ],
              },
            ],
          },
        ],
      },

      // ──────────────────────────────────────────
      // 3-MODUL: TEXNIK TADBIRLAR
      // ──────────────────────────────────────────
      {
        title: '3-Modul: Texnik tadbirlar (Ish joyini tayyorlash)',
        theories: [
          {
            title: '3.1-dars: Kuchlanishni o\'chirish (1-chi oltin qoida)',
            content: `O'chirish ketma-ketligi:\nYukni kamaytirish → Ajratgich o'chirish → Razedinitelni ochish → Blokirovka qo'yish\n\nAvval razedinitelni ochib, keyin ajratgichni o'chirish — O'LDIRUVCHI XATO!`,
            questions: [
              {
                prompt: 'Kuchlanishni o\'chirishning to\'g\'ri tartibini tanlang',
                type: SC,
                options: [
                  { text: 'Razedinitelni ochish → Ajratgichni o\'chirish → Blokirovka', correct: false },
                  { text: 'Yukni kamaytirish → Ajratgichni o\'chirish → Razedinitelni ochish → Blokirovka', correct: true },
                  { text: 'Blokirovka → Ajratgich → Razedinitel', correct: false },
                ],
              },
              {
                prompt: 'Faqat bitta ajratgichni o\'chirish yetarli',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
            ],
          },
          {
            title: '3.2-dars: Kuchlanish yo\'qligini tekshirish (2-chi oltin qoida)',
            content: `Tekshirish algoritmi:\n1. Ko'rsatkichni ishlayotgan simda sinab ko'ring\n2. A, B, C — uchala fazani tekshirish\n3. Yana ishlayotgan simda ko'rsatkich ishlab turganiga ishonch hosil qilish`,
            questions: [
              {
                prompt: 'Kuchlanish yo\'qligini tekshirishda birinchi qadam nima?',
                type: SC,
                options: [
                  { text: 'Darhol fazalarni tekshirish', correct: false },
                  { text: 'Ko\'rsatkichni kuchlanish borligini bilgan simda sinab ko\'rish', correct: true },
                  { text: 'Yerlatgich o\'rnatish', correct: false },
                ],
              },
              {
                prompt: 'Ko\'rsatkich batareyasi tugagan bo\'lishi mumkin, shuning uchun tekshirishdan oldin ham, keyin ham sinab ko\'rish shart',
                type: YN,
                options: [
                  { text: 'Ha', correct: true },
                  { text: 'Yo\'q', correct: false },
                ],
              },
            ],
          },
          {
            title: '3.3-dars: Yerlatish o\'rnatish (3-chi oltin qoida)',
            content: `O'rnatish: ER shinasiga → Faza A → Faza B → Faza C (avval yer, keyin faza)\nYechish: Faza C → Faza B → Faza A → ER shinasidan (avval faza, keyin yer)\n\nKo'chma yerlatgich mis kesimi 25 mm² dan kam bo'lmasin!`,
            questions: [
              {
                prompt: 'Yerlatgich o\'rnatish tartibini moslang',
                type: MA,
                options: [
                  { text: '1-qadam', correct: true, match: 'ER shinasiga' },
                  { text: '2-qadam', correct: true, match: 'Faza A' },
                  { text: '3-qadam', correct: true, match: 'Faza B' },
                  { text: '4-qadam', correct: true, match: 'Faza C' },
                ],
              },
              {
                prompt: 'Yerlatgich yechish tartibini tanlang',
                type: SC,
                options: [
                  { text: 'ER → C → B → A', correct: false },
                  { text: 'C → B → A → ER', correct: true },
                  { text: 'A → B → C → ER', correct: false },
                ],
              },
            ],
          },
          {
            title: '3.4-dars: Qo\'riqlovchi to\'siqlar o\'rnatish (4-chi oltin qoida)',
            content: `To'siq turlari:\n• Izolyatsiyalangan to'siq — kuchlanish ostidagi qismlarga yaqin\n• Saqlash arqon-lentasi — xavfli zonani chegaralash\n• Ko'chma to'siq-panel — hajmli xavfli zona\n\nTo'siqni faqat ISHGA RUXSAT BERUVCHI o'zgartirishi mumkin.`,
            questions: [
              {
                prompt: 'To\'siqni xodim o\'zi vaqtincha ko\'chirib, keyin qaytarishi mumkin',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
              {
                prompt: '35 kVli qurilmada ish bor, yonidagi 110 kVli shin kuchlanish ostida. Nima kerak?',
                type: SC,
                options: [
                  { text: 'Hech narsa, 35 kV xavfsiz', correct: false },
                  { text: '110 kVli shin yoniga ogohlantiruvchi to\'siq o\'rnatiladi', correct: true },
                  { text: 'Ishni boshqa joyga ko\'chirish kerak', correct: false },
                ],
              },
            ],
          },
          {
            title: '3.5-dars: Plakat va belgilar ilish (5-chi oltin qoida)',
            content: `Ish joyida ilinishi shart bo'lgan plakatlar:\n• Blokirovka qilingan klyuchda — YOQMANG! Odamlar ishlayapti\n• Kuchlanish ostidagi qurilmalar yonida — TO'XTANG! Kuchlanish\n• Ish joyida — SHU YERDA ISHLANG\n• Yerlatgich o'rnatilgan joyda — YERLATILGAN`,
            questions: [
              {
                prompt: 'Plakatlarni mos joylarga biriktiring',
                type: MA,
                options: [
                  { text: 'Klyuchda', correct: true, match: 'YOQMANG!' },
                  { text: 'Kuchlanish yonida', correct: true, match: 'TO\'XTANG!' },
                  { text: 'Ish joyida', correct: true, match: 'SHU YERDA ISHLANG' },
                  { text: 'Yerlatgich yonida', correct: true, match: 'YERLATILGAN' },
                ],
              },
              {
                prompt: 'Dispetcher plakatni olishni buyurdi. Siz rad etishingiz kerakmi?',
                type: YN,
                options: [
                  { text: 'Ha', correct: true },
                  { text: 'Yo\'q', correct: false },
                ],
              },
            ],
          },
        ],
      },

      // ──────────────────────────────────────────
      // 4-MODUL: FAVQULODDA VAZIYATLAR
      // ──────────────────────────────────────────
      {
        title: '4-Modul: Favqulodda vaziyatlar va maxsus ishlar',
        theories: [
          {
            title: '4.1-dars: Elektr toki urishida birinchi yordam',
            content: `Birinchi qoida: Jabrlanuvchiga yalang'och qo'l bilan tegmang!\n\n6 qadam algoritm:\n1. TOKDAN AJRATING\n2. XAVFSIZ JOYGA O'TKARING\n3. HUSHINI TEKSHIRING\n4. NAFAS OLISHINI TEKSHIRING\n5. TEZKOR YORDAM CHAQIRING (103/112)\n6. YOR BOSHLANG\n\nYOR nisbati: 30:2 (30 ta siqish + 2 ta nafas). Chuqurlik: 5-6 sm. Tezlik: 100-120/daqiqa.`,
            questions: [
              {
                prompt: 'Birinchi yordam to\'g\'ri tartibini tanlang',
                type: SC,
                options: [
                  { text: 'YOR → 112 → Tokdan ajratish', correct: false },
                  { text: 'Tokdan ajratish → Hushini tekshirish → Nafas tekshirish → 112 → YOR', correct: true },
                  { text: '112 → Tokdan ajratish → YOR', correct: false },
                ],
              },
              {
                prompt: 'YOR nisbati qanday?',
                type: SC,
                options: [
                  { text: '15:1', correct: false },
                  { text: '30:2', correct: true },
                  { text: '20:3', correct: false },
                ],
              },
              {
                prompt: 'Jabrlanuvchiga tok urayotganida qo\'l bilan ushlab tortish xavflimi?',
                type: YN,
                options: [
                  { text: 'Ha', correct: true },
                  { text: 'Yo\'q', correct: false },
                ],
              },
            ],
          },
          {
            title: '4.2-dars: Balandlikda ishlash xavfsizligi',
            content: `1,8 metr va undan yuqori — "Balandlikda ishlash".\n\nVositalar: Xavfsizlik kamari (6 oyda sinov), Narvon (75° burchak), Lesa, Karabin.\n\nKarabin mahkamlanish nuqtasi — doimo bel darajasidan YUQORIDA!\n\nTaqiqlangan: kamarsiz, yolg\'iz, momaqaldiroqda, muzlagan narvonda, tumanda.`,
            questions: [
              {
                prompt: 'Narvon burchagi 60° bo\'lsa, ishlash mumkin',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
              {
                prompt: 'Balandlikda ishlash necha metrdan boshlanadi?',
                type: SC,
                options: [
                  { text: '1,0 metr', correct: false },
                  { text: '1,5 metr', correct: false },
                  { text: '1,8 metr', correct: true },
                  { text: '2,0 metr', correct: false },
                ],
              },
              {
                prompt: 'Karabin mahkamlanish nuqtasi beldan past bo\'lishi xatomi?',
                type: YN,
                options: [
                  { text: 'Ha', correct: true },
                  { text: 'Yo\'q', correct: false },
                ],
              },
            ],
          },
          {
            title: '4.3-dars: Elektr qurilmalarida yong\'inni o\'chirish',
            content: `Tok ostidagi uskunalarni SUV BILAN O'CHIRIB BO'LMAYDI!\n\nO'chirgichlar:\n• Suv (OV) — taqiqlangan\n• Ko'pik (OP) — taqiqlangan\n• Kukun — 1 kV gacha\n• CO₂ (OU) — 10 kV gacha\n\nOU bilan 1 metrdan yaqin bormang!`,
            questions: [
              {
                prompt: 'O\'chirgichlarni mos kuchlanishga biriktiring',
                type: MA,
                options: [
                  { text: 'Suv (OV)', correct: true, match: 'Taqiqlangan' },
                  { text: 'Ko\'pik (OP)', correct: true, match: 'Taqiqlangan' },
                  { text: 'Kukun', correct: true, match: '1 kV gacha' },
                  { text: 'CO₂ (OU)', correct: true, match: '10 kV gacha' },
                ],
              },
              {
                prompt: 'OU bilan 0,5 m dan yaqin ishlash mumkin',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
              {
                prompt: 'Kuchlanish ostidagi qurilmada yong\'in bo\'lganda to\'g\'ri tartib qanday?',
                type: SC,
                options: [
                  { text: 'Darhol suv bilan o\'chirish', correct: false },
                  { text: 'Dispetcherga xabar → Kuchlanish o\'chishini kutish → O\'chirishni boshlash', correct: true },
                  { text: 'Yong\'in xizmatiga qo\'ng\'iroq → Kutish', correct: false },
                ],
              },
            ],
          },
          {
            title: '4.4-dars: Kimyoviy va radiatsion xavf',
            content: `Podstansiyalardagi kimyoviy xavflar:\n• Transformator yog'i — yong'in xavfi\n• Sulfat kislotasi — kimyoviy kuyish\n• Vodorod gazi — portlash xavfi\n• SF₆ gazi — bo'g'ilish\n\nAkkumulyator xonasiga kirishdan 15 daqiqa oldin shamollatish majburiy.`,
            questions: [
              {
                prompt: 'Akkumulyator xonasiga kirishdan oldin nima majburiy?',
                type: SC,
                options: [
                  { text: 'Niqob kiyish', correct: false },
                  { text: 'Kamida 15 daqiqa shamollatish', correct: true },
                  { text: 'Olov o\'chirgich tayyorlash', correct: false },
                ],
              },
              {
                prompt: 'SF₆ gaz chiqishi bo\'lgan xonada oddiy niqob bilan ishlash mumkin',
                type: YN,
                options: [
                  { text: 'Ha', correct: false },
                  { text: 'Yo\'q', correct: true },
                ],
              },
              {
                prompt: 'Kimyoviy xavflarni mos manbalarga biriktiring',
                type: MA,
                options: [
                  { text: 'Transformator yog\'i', correct: true, match: 'Yong\'in xavfi' },
                  { text: 'Sulfat kislotasi', correct: true, match: 'Kimyoviy kuyish' },
                  { text: 'Vodorod gazi', correct: true, match: 'Portlash xavfi' },
                  { text: 'SF₆ gazi', correct: true, match: 'Bo\'g\'ilish' },
                ],
              },
            ],
          },
        ],
      },
    ];
  }
}
