import { Injectable } from '@nestjs/common';
import { SWAGGER_RELATIVE_PATH } from './swagger.constants';

@Injectable()
export class AppService {
  getPublicInfo() {
    return {
      service: 'ElektroLearn Backend',
      version: '1.0.0',
      docsUrl: `/api/${SWAGGER_RELATIVE_PATH}`,
      apiPrefix: '/api',
    };
  }
}
