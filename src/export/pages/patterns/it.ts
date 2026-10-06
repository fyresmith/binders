/*! Hyphenation patterns (it), from TeX's hyph-utf8: hyph-it.tex, unchanged but in how they are packed.
https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-it.tex
The head of that file follows, as it is.

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
% hyphenmins:
%     typesetting:
%         left: 2
%         right: 2
% changes:
%     - 2014-04-22 - Add few patterns involving `h'
%     - 2011-08-16 - Change the licence from GNU LGPL into LPPL v1.3.
%     - 2010-05-24 - Fix for Italian patterns for proper hyphenation of -ich and Ljubljana.
%     - 2008-06-09 - Import of original ithyph.tex into hyph-utf8 package.
%     - 2008-03-08 - (last change in ithyph.tex)
% texlive:
%     encoding: ascii
%     babelname: italian
%     legacy_patterns: ithyph.tex
%     message: Italian hyphenation patterns
%     description: |-
%         Hyphenation patterns for Italian in ASCII encoding.
%         Compliant with the Recommendation UNI 6461 on hyphenation
%         issued by the Italian Standards Institution
%         (Ente Nazionale di Unificazione UNI).
% ==========================================
%
% These hyphenation patterns for the Italian language are supposed to comply
% with the Recommendation UNI 6461 on hyphenation issued by the Italian
% Standards Institution (Ente Nazionale di Unificazione UNI).  No guarantee
% or declaration of fitness to any particular purpose is given and any
% liability is disclaimed.
%
*/
// Made by scripts/hyphenation-patterns.mjs: change that and run it, not this file.
// 355 patterns and 0 words broken by hand.
import type { Patterns } from '../hyphenate';

const patterns: Patterns = {
	leftmin: 2,
	rightmin: 2,
	patterns: {
		2: "1b1c1d1f1g1h1j1k1l1m1n1p1q1r1t1v1w1x1z",
		3: "2'2e2w2bb2bc2bd2bf2bm2bn2bp2bs2bt2bvb2lb2r2b_2b'2cb2cc2cd2cf2ck2cm2cn2cq2cs2ct2czc2hc2lc2r2c_2c'_c22db2dd2dg2dl2dm2dn2dpd2r2ds2dt2dv2dw2d_2d'_d22fb2fg2ff2fnf2lf2r2fs2ft2f_2f'2gb2gd2gf2ggg2hg2l2gmg2n2gpg2r2gs2gt2gv2gw2gz2g_2g'_h22hb2hd2hhh2l2hm2hn2hr2hv2h_2h'_j22j_2j'_k22kg2kfk2h2kkk2l2kmk2r2ks2kt2k_2k'2lb2lc2ld2lgl2hl2j2lk2ll2lm2ln2lp2lq2lr2ls2lt2lv2lw2lz2l_2mb2mc2mf2ml2mm2mn2mp2mq2mr2ms2mt2mv2mw2m_2m'2nb2nc2nd2nf2ng2nk2nl2nm2nn2np2nq2nr2ns2nt2nv2nz2n_2n'2pdp2hp2l2pn2ppp2r2ps2pt2pz2p_2p'2qq2q_2q'2rb2rc2rd2rfr2h2rg2rk2rl2rm2rn2rp2rq2rr2rs2rt2rv2rx2rw2rz2r_2r'1s22sz4s__t22tb2tc2td2tf2tgt2ht2l2tm2tn2tpt2rt2s2tt2tv2twt2z2t_2vcv2lv2r2vv2v_w2h2w_2w'2xb2xc2xf2xh2xm2xp2xt2xw2x_2x'y1i2zb2zd2zl2zn2zp2zt2zs2zv2zz2z__z2",
		4: "_p2sa1iaa1iea1ioa1iua1uoa1ya2at_e1iuo1iao1ieo1ioo1iu2chh2ch_2chbch2r2chn2l'_2l''2shm2sh_2sh'2s3s2stb2stc2std2stf2stg2stm2stn2stp2sts2stt2stv4s'_4s''2th_2tzktz2s2t'_2t''2v'_2v''wa2r2w1yy1ou2z'_2z''",
		5: "_bio1_ph2l_ph2r_pre12ch'_2gh2t2l3f2n2g3n3p2nes4s3mt2t3s",
		6: "_a3p2n_anti1_free3_opto1_para12ch''_hi3p2n2nheit3p2sicr2t2s32s3p2n3t2sch",
		7: "_ca4p3s_e2x1eu_narco1_su2b3r_wa2g3n_wel2t1n2s3fer",
		8: "_contro1_fran2k3_li3p2sa_orto3p2_poli3p2_sha2re3_su2b3lu",
		9: "_anti3m2n_circu2m1_re1i2scr_tran2s3c_tran2s3d_tran2s3l_tran2s3n_tran2s3p_tran2s3r_tran2s3t",
		10: "_di2s3cine",
	},
	exceptions: "",
};
export default patterns;
