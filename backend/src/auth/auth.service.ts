import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Cohort, JwtPayload } from '../common/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  issueCohortToken(cohort: Cohort): { access_token: string; cohort: Cohort } {
    // Unique per login so each session keeps its own conversational "last
    // patient" context — two clinicians in the same cohort must not share it.
    const payload: JwtPayload = {
      cohort,
      sub: `cohort-${cohort}:${uuidv4()}`,
    };

    const access_token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '24h'),
    });

    return { access_token, cohort };
  }
}
