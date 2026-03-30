import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getPublicInfo() {
    return {
      service: 'ElektroLearn Backend',
      version: '1.0.0',
      docsUrl: '/docs',
      apiPrefix: '/api',
    };
  }
}
