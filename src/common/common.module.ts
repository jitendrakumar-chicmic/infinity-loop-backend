import { HttpModule } from '@nestjs/axios';
import { Module, Global } from '@nestjs/common';

import { AdminHttpService } from './http/admin-http.service';
import { UserHttpService } from './http/user-http.service';

@Global()
@Module({
    imports: [HttpModule],
    providers: [AdminHttpService, UserHttpService],
    exports: [AdminHttpService, UserHttpService, HttpModule],
})
export class CommonModule {}
