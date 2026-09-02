import {
  normalizeOrganizationName,
  organizationNamesEquivalent,
} from './organization-name.normalize';

describe('normalizeOrganizationName', () => {
  it('1C boshidagi AJ ni qo`shtirnoqdan keyinga ko`chiradi', () => {
    expect(
      normalizeOrganizationName('АJ "O`ZBEKISTON MILLIY ELEKTR TARMOQLARI"'),
    ).toBe('"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ');
  });

  it('filial qismini vergul bilan ajratadi', () => {
    expect(
      normalizeOrganizationName(
        'АJ "O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" JIZZAX MAGISTRAL ELEKTR TARMOQLARI FILIALI',
      ),
    ).toBe(
      '"O`ZBEKISTON MILLIY ELEKTR TARMOQLARI" AJ, JIZZAX MAGISTRAL ELEKTR TARMOQLARI FILIALI',
    );
  });
});
