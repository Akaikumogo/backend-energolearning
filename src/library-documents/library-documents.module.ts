import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LibraryDocument } from '../database/entities/library-document.entity';
import { AdminLibraryDocumentsController } from './admin-library-documents.controller';
import { LibraryDocumentsController } from './library-documents.controller';
import { LibraryDocumentsService } from './library-documents.service';

@Module({
  imports: [TypeOrmModule.forFeature([LibraryDocument])],
  controllers: [LibraryDocumentsController, AdminLibraryDocumentsController],
  providers: [LibraryDocumentsService],
})
export class LibraryDocumentsModule {}
