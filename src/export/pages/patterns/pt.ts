/*! Hyphenation patterns (pt), from TeX's hyph-utf8: hyph-pt.tex, unchanged but in how they are packed.
https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-pt.tex
The head of that file follows, as it is.

% title: Hyphenation patterns for Portuguese
% copyright: Copyright (C) 1987, 1994, 1996, 2015 Pedro J. de Rezende, 1996, 2015 J. Joao Dias Almeida, 2024 Leonardo Araujo and Aline Benevides
% notice: This file is part of the hyph-utf8 package.
%     See http://www.hyphenation.org/tex for more information.
% language:
%     name: Portuguese
%     tag: pt
% version: 1.4 2024-07-13
% authors:
%   -
%     name: Pedro J. de Rezende
%     contact: rezende (at) ic.unicamp.br
%   -
%     name: J. Joao Dias Almeida
%     contact: jj (at) di.uminho.pt
%   -
%     name: Leonardo Araujo
%     contact: leolca (at) gmail.com
%   -
%     name: Aline Benevides
%     contact: benevides.aline12 (at) gmail.com
% licence:
%     name: BSD 3-clause licence
%     url: https://opensource.org/licenses/BSD-3-Clause
%     text: >
%         Redistribution and use in source and binary forms, with or without
%         modification, are permitted provided that the following conditions
%         are met:
%         * Redistributions of source code must retain the above copyright
%           notice, this list of conditions and the following disclaimer.
%         * Redistributions in binary form must reproduce the above copyright
%           notice, this list of conditions and the following disclaimer in the
%           documentation and/or other materials provided with the
%           distribution.
%         * Neither the name of the University of Campinas, of the University
%           of Minho nor the names of its contributors may be used to endorse
%           or promote products derived from this software without specific
%           prior written permission.
% 
%         THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
%         "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
%         LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
%         A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL PEDRO J. DE
%         REZENDE OR J.JOAO DIAS ALMEIDA BE LIABLE FOR ANY DIRECT, INDIRECT,
%         INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
%         BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS
%         OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
%         AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
%         LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
%         WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
%         POSSIBILITY OF SUCH DAMAGE.
% hyphenmins:
%     typesetting:
%         left: 2
%         right: 3
% changes:
%     - Version 1.4 Release date: 13/07/2024 Leonardo Araujo and Aline Benevides
%     - Version 1.3 Release date: 12/08/2015 Pedro J. de Rezende and J. Joao Dias Almeida
%     - Version 1.2 Release date: 07/21/1996 Pedro J. de Rezende and J. Joao Dias Almeida
%     - Version 1.1 Release date: 04/12/1994 Pedro J. de Rezende
%     - Version 1.0 Release date: 02/13/1987 Pedro J. de Rezende
% texlive:
%     synonyms:
%         - portuges
%     encoding: ec
%     babelname: portuguese
%     legacy_patterns: pthyph.tex
%     message: Portuguese hyphenation patterns
%     description: Hyphenation patterns for Portuguese in T1/EC and UTF-8 encodings.
%
*/
// Made by scripts/hyphenation-patterns.mjs: change that and run it, not this file.
// 427 patterns and 2 words broken by hand.
import type { Patterns } from '../hyphenate';

const patterns: Patterns = {
	leftmin: 2,
	rightmin: 4,
	patterns: {
		2: "1-",
		3: "1ba1be1bi1bo1bu1bá1bâ1bã1bé1bí1bó1bú1bê1bõ1ca1ce1ci1co1cu1cá1câ1cã1cé1cí1có1cú1cê1cõ1ça1çe1çi1ço1çu1çá1çâ1çã1çé1çí1çó1çú1çê1çõ1da1de1di1do1du1dá1dâ1dã1dé1dí1dó1dú1dê1dõ1fa1fe1fi1fo1fu1fá1fâ1fã1fé1fí1fó1fú1fê1fõ1ga1ge1gi1go1gu1gá1gâ1gã1gé1gí1gó1gú1gê1gõ1ja1je1ji1jo1ju1já1jâ1jã1jé1jí1jó1jú1jê1jõ1ka1ke1ki1ko1ku1ká1kâ1kã1ké1kí1kó1kú1kê1kõ1la1le1li1lo1lu1lá1lâ1lã1lé1lí1ló1lú1lê1lõ1ma1me1mi1mo1mu1má1mâ1mã1mé1mí1mó1mú1mê1mõ1na1ne1ni1no1nu1ná1nâ1nã1né1ní1nó1nú1nê1nõ1pa1pe1pi1po1pu1pá1pâ1pã1pé1pí1pó1pú1pê1põ1ra1re1ri1ro1ru1rá1râ1rã1ré1rí1ró1rú1rê1rõ1sa1se1si1so1su1sá1sâ1sã1sé1sí1só1sú1sê1sõ1ta1te1ti1to1tu1tá1tâ1tã1té1tí1tó1tú1tê1tõ1va1ve1vi1vo1vu1vá1vâ1vã1vé1ví1vó1vú1vê1võ1xa1xe1xi1xo1xu1xá1xâ1xã1xé1xí1xó1xú1xê1xõ1za1ze1zi1zo1zu1zá1zâ1zã1zé1zí1zó1zú1zê1zõa3aa3ea3oc3ce3ae3ee3oi3ai3ei3ii3oi3âi3êi3ôo3ao3eo3or3rs3su3au3eu3ou3ut2c1qu1vô1lô1cô1gô1bô1tô1rô1pôa1éa1ía1óa1úe1áe1âe1ãe1ée1êe1íe1óé1oe1úi1ái1ãí1ai1éi1íi1óí1oi1ui1úo1áo1éo1ío1óu1áu1ãu1âu1íú1o4a_4e_4o__s21dô1fô1mô1nô1sô1zôí1eu1ê1çôu1é1xôa1âa1ãa1ôe1ôo1ão1ê_t2",
		4: "1b2l1b2r1c2h1c2l1c2r1d2l1d2r1f2l1f2r1g2l1g2r1k2l1k2r1l2h1n2h1p2l1p2r1t2l1t2r1v2l1v2r1w2l1w2r_t2m_p2t_m2nc2zatu1ibu1inu1io1inu1insu1iju1ifu1idu1iau1io1im",
		5: "1gu4a1gu4e1gu4i1gu4o1qu4a1qu4e1qu4i1qu4o_p2si_p2sí_g2no_g2nó_g2nôa1ir_u1ir_1qu2á1qu2â1qu2í1gu2ía1inde1impe1ince1infe1inge1inse1inte1invu1iz_a1iz_1gu2á1gu2ã1qu2ãtu2ittu2iddo1imu1i1ç1gu2ê1qu2ê1gu2é1qu2é_ne4o",
		6: "1p2neusu2b3rsu2b3la1i1nho2i1naco2ima",
		7: "pro1i1b",
		8: "_su3b4li1p2seu1d",
	},
	exceptions: "hard-ware soft-ware",
};
export default patterns;
