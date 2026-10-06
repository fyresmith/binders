# Third-party notices

Binders is under the MIT licence ([LICENSE](LICENSE)). The plugin as it is given out (`main.js`) also holds the work
of others, each under its own licence: the hyphenation patterns its pages are set with, and the two typefaces of its
book styles. This file names each, who holds its copyright, and the licence it comes under.

It also holds code from npm packages, named in the last section. Obsidian, Electron and CodeMirror are not in it
(they are Obsidian's own, and the build leaves them out), and everything else in `devDependencies` only builds and
tests the plugin.

## Hyphenation patterns

From TeX's hyph-utf8 package, <https://github.com/hyphenation/tex-hyphen>, each file as it stood at commit
`5684c0f51c0b81133db2efbe60a408b4155a3ff5` (2026-02-24) in `hyph-utf8/tex/generic/hyph-utf8/patterns/tex/`. The patterns are not
changed, only packed another way (`scripts/hyphenation-patterns.mjs` makes `src/export/pages/patterns/*.ts` from
them). The head of each file, with its copyright and licence, is at the top of its module and is kept in `main.js`,
at its end. What follows is each file's title, copyright and licence, as the file gives them.

| Language | File | Copyright | Licence |
|---|---|---|---|
| German, reformed spelling (`de`) | [`hyph-de-1996.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-de-1996.tex) | Stephan Hennig, Werner Lemberg, Günter Milde, Sander van Geloven, Georg Pfeiffer, Gisbert W. Selke, Tobias Wendorf, Keno Wehr (2013-2024) | MIT |
| British English (`en-gb`, used for every English but American and Canadian) | [`hyph-en-gb.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-en-gb.tex) | Dominik Wujastyk, Graham Toal (1992, 1996, 2005, 2016) | MIT |
| American English (`en-us`, used for American and Canadian English) | [`hyph-en-us.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-en-us.tex) | Gerard D.C. Kuiken (1990, 2004, 2005); it holds Donald E. Knuth's patterns and exceptions from `hyphen.tex` | Copying and distribution permitted, with or without modification, provided the copyright notice and the notice are preserved |
| Spanish (`es`) | [`hyph-es.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-es.tex) | Javier Bezos (1993, 1997, 2001-2019), CervanTeX | MIT/X11 |
| French (`fr`) | [`hyph-fr.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-fr.tex) | Daniel Flipo, Bernard Gaulle (1994-2002), Arthur Reutenauer (2016) | MIT |
| Italian (`it`) | [`hyph-it.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-it.tex) | Claudio Beccari (2008-2011) | MIT, or LPPL 1.3 or later, as the taker chooses: Binders takes it under MIT |
| Portuguese (`pt`) | [`hyph-pt.tex`](https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-pt.tex) | Pedro J. de Rezende (1987, 1994, 1996, 2015), J. Joao Dias Almeida (1996, 2015), Leonardo Araujo and Aline Benevides (2024) | BSD 3-clause |

### German, reformed spelling (`de`)

From the head of `hyph-de-1996.tex`:

```text
% title: German Hyphenation Patterns (Reformed Orthography, 2006)
%
% notice: TeX-Trennmuster für die reformierte (2006) deutsche Rechtschreibung
%
% version: 2024-02-28
%
% authors:
%   -
%     name:    Deutschsprachige Trennmustermannschaft
%     contact: trennmuster@dante.de
%
% copyright: Copyright (c) 2013-2024
%            Stephan Hennig, Werner Lemberg, Günter Milde,
%            Sander van Geloven, Georg Pfeiffer, Gisbert W. Selke,
%            Tobias Wendorf, Keno Wehr
%
% licence:
%     name: MIT
%     url:  https://opensource.org/licenses/mit-license.php
%     text: >
%           Permission is hereby granted, free of charge, to any person
%           obtaining a copy of this software and associated documentation
%           files (the “Software”), to deal in the Software without
%           restriction, including without limitation the rights to use,
%           copy, modify, merge, publish, distribute, sublicense, and/or
%           sell copies of the Software, and to permit persons to whom the
%           Software is furnished to do so, subject to the following
%           conditions:
%
%           The above copyright notice and this permission notice shall be
%           included in all copies or substantial portions of the Software.
%
%           THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
%           EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
%           OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
%           NONINFRINGEMENT.  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
%           HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
%           WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
%           FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
%           OTHER DEALINGS IN THE SOFTWARE.
```

### British English (`en-gb`, used for every English but American and Canadian)

From the head of `hyph-en-gb.tex`:

```text
% title: Hyphenation patterns for British English
% copyright: Copyright (C) 1992, 1996, 2005, 2016 Dominik Wujastyk, Graham Toal
% notice: This file is part of the hyph-utf8 package.
%     See http://www.hyphenation.org/tex for more information.
% language:
%     name: English, British spelling
%     tag: en-gb
% authors:
%   -
%     name: Dominik Wujastyk
%     contact: wujastyk (at) gmail.com
%   -
%     name: Graham Toal
% licence:
%     name: MIT
%     url: https://opensource.org/licenses/MIT
%     text: >
%           Permission is hereby granted, free of charge, to any person
%           obtaining a copy of this software and associated documentation
%           files (the “Software”), to deal in the Software without
%           restriction, including without limitation the rights to use,
%           copy, modify, merge, publish, distribute, sublicense, and/or
%           sell copies of the Software, and to permit persons to whom the
%           Software is furnished to do so, subject to the following
%           conditions:
%
%           The above copyright notice and this permission notice shall be
%           included in all copies or substantial portions of the Software.
%
%           THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND,
%           EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
%           OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
%           NONINFRINGEMENT.  IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
%           HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
%           WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
%           FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
%           OTHER DEALINGS IN THE SOFTWARE.
```

### American English (`en-us`, used for American and Canadian English)

From the head of `hyph-en-us.tex`:

```text
% title: Hyphenation patterns for American English
% copyright: Copyright (C) 1990, 2004, 2005 Gerard D.C. Kuiken
% notice: This file is part of the hyph-utf8 package.
%     See http://www.hyphenation.org/tex for more information.
% language:
%     name: English, American spelling
%     tag: en-us
% version: 2005-05-30
% authors:
%   -
%     name: Gerard D.C. Kuiken
% licence:
%     text: >
%         Copying and distribution of this file, with or without modification,
%         are permitted in any medium without royalty provided the copyright
%         notice and this notice are preserved.
```

The file says of itself that it "contains both the additional patterns from Dr. Kuiken, and the original patterns
and hyphenations from Knuth's hyphen.tex". Knuth's `hyphen.tex` (<https://ctan.org/pkg/hyphen-base>) begins:

```text
% The Plain TeX hyphenation tables [NOT TO BE CHANGED IN ANY WAY!]
% Unlimited copying and redistribution of this file are permitted as long
% as this file is not modified. Modifications are permitted, but only if
% the resulting file is not named hyphen.tex.
```

Binders does not give out a file of that name.

### Spanish (`es`)

From the head of `hyph-es.tex`:

```text
% copyright: Copyright (C) 1993, 1997 Javier Bezos, 2001-2019 Javier Bezos, CervanTeX
% title: Hyphenation patterns for Spanish
% notice: This file is part of the hyph-utf8 package.
%     See http://www.hyphenation.org/tex for more information.
% language:
%     name: Spanish
%     tag: es
% version: 5.0 2019-09-24
% authors:
%   -
%     name: Javier Bezos
% licence:
%     name: MIT/X11
%     url: https://opensource.org/licenses/MIT
%     text: >
%         Permission is hereby granted, free of charge, to any person obtaining a copy
%         of this software and associated documentation files (the "Software"), to deal
%         in the Software without restriction, including without limitation the rights
%         to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
%         copies of the Software, and to permit persons to whom the Software is
%         furnished to do so, subject to the following conditions:
%
%         The above copyright notice and this permission notice shall be included in
%         all copies or substantial portions of the Software.
%
%         THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
%         IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
%         FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
%         AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
%         LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
%         OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
%         SOFTWARE.
```

### French (`fr`)

From the head of `hyph-fr.tex`:

```text
% title: Hyphenation patterns for French
% copyright: Copyright (C) 1994-2002 Daniel Flipo, Bernard Gaulle, 2016 Arthur Reutenauer
% notice: This file is part of the hyph-utf8 package.
%     See http://www.hyphenation.org/tex for more information.
% language:
%     name: French
%     tag: fr
% version: V2.13 2016/05/12
% authors:
%     -
%         name: Daniel Flipo
%     -
%         name: Bernard Gaulle
%         note: deceased
%     -
%         name: Arthur Reutenauer
%         contact: arthur (at) reutenauer.eu
%     -
%         email: cesure-l (at) gutenberg (dot} eu (dot) org
% licence:
%     name: MIT
%     url: https://opensource.org/licenses/MIT
%     text: >
%         Permission is hereby granted, free of charge, to any person obtaining
%         a copy of this software and associated documentation files (the
%         "Software"), to deal in the Software without restriction, including
%         without limitation the rights to use, copy, modify, merge, publish,
%         distribute, sublicense, and/or sell copies of the Software, and to
%         permit persons to whom the Software is furnished to do so, subject to
%         the following conditions:
%
%         The above copyright notice and this permission notice shall be
%         included in all copies or substantial portions of the Software.
%
%         THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
%         EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
%         MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
%         NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
%         BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
%         ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
%         CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
%         SOFTWARE.
```

### Italian (`it`)

From the head of `hyph-it.tex`:

```text
% title: Hyphenation patterns for Italian
% copyright: Copyright (C) 2008-2011 Claudio Beccari
% notice: This file is part of the hyph-utf8 package.
%     See http://www.hyphenation.org/tex for more information.
% language:
%     name: Italian
%     tag: it
% version: 4.9 2014/04/22
% authors:
%   -
%     name: Claudio Beccari
%     contact: claudio.beccari (at) gmail.com
% licence:
%     - This file is available under any of the following licences:
%     -
%         name: LPPL
%         version: 1.3
%         or_later: true
%         url: http://www.latex-project.org/lppl.txt
%         status: maintained
%         maintainer: Claudio Beccari, e-mail claudio dot beccari at gmail dot com
%     -
%         name: MIT
%         url: https://opensource.org/licenses/MIT
%         text: >
%             Permission is hereby granted, free of charge, to any person
%             obtaining a copy of this software and associated documentation
%             files (the "Software"), to deal in the Software without
%             restriction, including without limitation the rights to use,
%             copy, modify, merge, publish, distribute, sublicense, and/or sell
%             copies of the Software, and to permit persons to whom the
%             Software is furnished to do so, subject to the following
%             conditions:
%
%             The above copyright notice and this permission notice shall be
%             included in all copies or substantial portions of the Software.
%
%             THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
%             EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
%             OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
%             NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
%             HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
%             WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
%             FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
%             OTHER DEALINGS IN THE SOFTWARE.
```

### Portuguese (`pt`)

From the head of `hyph-pt.tex`:

```text
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
```

## Typefaces

The Classic book style is set in EB Garamond and the Modern one in Source Serif 4. Four faces of each (regular,
italic, bold, bold italic) are inside `main.js` as WOFF2 files; the files are in `src/export/fonts/`, with each
family's own notice beside them (`OFL-EBGaramond.txt`, `OFL-SourceSerif4.md`). A PDF that Binders exports has the
letters it uses of them embedded. Both families are under the SIL Open Font License, version 1.1, given once below.

- **EB Garamond** is a Modified Version: its four files are cut down to the Latin alphabet and what a book needs of
  it (`scripts/subset-fonts.py`). Its licence declares no Reserved Font Name, so the files keep the family's name.
- **Source Serif 4** is the Original Version, not modified in any way: the four files are Adobe's own, byte for
  byte, from its release 4.005R of <https://github.com/adobe-fonts/source-serif> (commit
  `2823e993c53fca27c5c8749f529b56a5a7c77b6b`, folder `WOFF2/TTF/`): `SourceSerif4-Regular.ttf.woff2`,
  `SourceSerif4-It.ttf.woff2`, `SourceSerif4-Semibold.ttf.woff2` (the styles' bold) and
  `SourceSerif4-SemiboldIt.ttf.woff2`. They are not subset, converted, renamed or compressed again, because the
  licence reserves the name "Source" to unmodified files. `scripts/source-serif-fonts.mjs` fetches them and checks
  each against its SHA-256, and a test fails if a file in the repository is not the one released.

### EB Garamond

```text
Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
```

No Reserved Font Name is declared.

### Source Serif 4

```text
Copyright 2014 - 2023 Adobe (http://www.adobe.com/), with Reserved Font Name ‘Source’. All Rights Reserved. Source is a trademark of Adobe in the United States and/or other countries.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
```

### SIL Open Font License, version 1.1

```text
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Code from npm packages

What the build puts into `main.js` from `node_modules` (the `dependencies` of `package.json` and what they need).
Each is under the licence its package names.

| Packages | Copyright | Licence |
|---|---|---|
| `fflate` | Arjun Barrett | MIT |
| `micromark`, `micromark-core-commonmark`, `micromark-extension-gfm-footnote`, `micromark-extension-gfm-strikethrough`, `micromark-extension-gfm-table`, and the `micromark-factory-*` and `micromark-util-*` packages they use | Titus Wormer | MIT |
| `mdast-util-from-markdown`, `mdast-util-gfm-footnote`, `mdast-util-gfm-strikethrough`, `mdast-util-gfm-table`, `mdast-util-to-string`, `unist-util-stringify-position`, `decode-named-character-reference`, `character-entities` | Titus Wormer | MIT |
| `monkey-around` | PJ Eby | ISC |

The MIT licence, as those packages give it:

```text
Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

The ISC licence, which `monkey-around` names in its `package.json` (the package carries no text of it):

```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
