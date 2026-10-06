/*! Hyphenation patterns (fr), from TeX's hyph-utf8: hyph-fr.tex, unchanged but in how they are packed.
https://github.com/hyphenation/tex-hyphen/blob/5684c0f51c0b81133db2efbe60a408b4155a3ff5/hyph-utf8/tex/generic/hyph-utf8/patterns/tex/hyph-fr.tex
The head of that file follows, as it is.

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
% hyphenmins:
%     typesetting:
%         left: 2
%         right: 2
% texlive:
%     synonyms:
%         - patois
%         - francais
%     encoding: ec
%     babelname: french
%     legacy_patterns: frhyph.tex
%     message: French hyphenation patterns
%     description: Hyphenation patterns for French in T1/EC and UTF-8 encodings.
% ==========================================
%%%%%%%% The most famous good guys who worked hard to obtain something usable.
% Jacques Desarmenien, Universite de Strasbourg :
%          -  << how to run TeX in a French environment: hyphenation, fonts,
%             typography. >> in Tugboat, 5 (1984) 91-102. and TeX85 conference
%          -  << La division par ordinateur des mots francais :
%             application a TeX >> in TSI vol. 5 No 4, 1986 (C) AFCET-
%                                                             Gauthier-Villars
% Norman Buckle, UQAH (nb; many additions)
% Michael Ferguson, INRS-Telecommunications (mjf) June 1988
% Justin Bur, Universite de Montreal (jbb; checked against original list)
%                    all patterns including apostrophe missing from nb list
% after that, GUTenberg  and specially Daniel Flipo and Bernard Gaulle
% did their best effort to improve the list of patterns.
%
%
*/
// Made by scripts/hyphenation-patterns.mjs: change that and run it, not this file.
// 1145 patterns and 0 words broken by hand.
import type { Patterns } from '../hyphenate';

const patterns: Patterns = {
	leftmin: 2,
	rightmin: 3,
	patterns: {
		2: "1ç1j1q",
		3: "2'2_a4'a4_â4'â41ba1bâ1be1bé1bè1bê1bi1bî1bo1bô1bu1bû1by1ca1câ1ce1cé1cè1cê1ci1cî1co1cô1cœ1cu1cû1cy1d'1da1dâ1de1dé1dè1dê1di1dî1do1dô1du1dû1dy_e4'e4_ê4'ê4_é4'é4_è4'è41fa1fâ1fe1fé1fè1fê1fi1fî1fo1fô1fu1fû1fy1ga1gâ1ge1gé1gè1gê1gi1gî1go1gô1gu1gû1gy1ha1hâ1he1hé1hè1hê1hi1hî1ho1hô1hu1hû1hy_i4'i4_î4'î42jk1ka1kâ1ke1ké1kè1kê1ki1kî1ko1kô1ku1kû1ky1la1lâ1là1le1lé1lè1lê1li1lî1lo1lô1lu1lû1ly1ma1mâ1me1mé1mè1mê1mi1mî1mo1mô1mœ1mu1mû1my1na1nâ1ne1né1nè1nê1ni1nî1no1nô1nœ1nu1nûn1x1ny_o4'o4'ô4_ô41pa1pâ1pe1pé1pè1pê1pi1pî1po1pô1pu1pû1py1ra1râ1re1ré1rè1rê1ri1rî1ro1rô1ru1rû1ry1sa1sâ1se1sé1sè1sê1si1sî1so1sô1sœ1su1sû1sy1ta1tâ1tà1te1té1tè1tê1ti1tî1to1tô1tu1tû1ty_u4'u4_û4'û41va1vâ1ve1vé1vè1vê1vi1vî1vo1vô1vu1vû1vy1wa1we1wi1wo1wu_y4'y41za1ze1zé1zè1zi1zo1zu1zy",
		4: "ab2had2h4be_1b2l1b2r4ce__ch41c2h4ch_2chb2chgch2l2chm2chn2chpch2r2chs2cht2chw1c2k4ck_2ckb2ckf2ckg2ckp2cks2ckt1c2l1c2r4de_1d2rd1s24fe_1f2l1f2rf1s24ge_1g2l1g2n1g2rg1s24he_il2l4je_4ke_1k2h4kh__kh41k2r4le_4me_m1s24ne_4pe_1p2h_ph44ph_ph2l2phnph2r2phs2pht1p2l1p2r4re_1r2h4se__sh41s2h4sh_2shm2shr2shs4te__th41t2h4th_2thl2thm2thnth2r2ths1t2r4ve_1v2r4we_1w2r4ze_",
		5: "4bes_4ble_4bre_4ces_4che_4cke_2ck3h4cle_co1apco1arco1auco1axco1é2co1efco1enco1ex_con44cre__cul4d1d2h4des__dé2s4dre_éd2hi4fes_4fle_4fre_4ges_1g2ha1g2he1g2hi1g2ho1g2hy4gle_4gne_4gre_4gue_4hes_cil3lgil3lhil3llil3lmil3lvil3lxil3li1oxy4jes_4kes_4les_l1s2t4mes_4nes_o1d2l4pes_per3h_pe4r4phe_4ple_1p2né4pre_4que__réu24res_4rhe__sch41s2ch4sch_2schs4ses_4she_4tes_4the_4tre_t1t2l4ves_4vre_4wes_4zes_",
		6: "_as2ta'as2ta2bent__bi1au_bi1u24bles_4bres_2cent_4ches_4chle_4chre_4ckes_4cles_co1accco1acqco1a2d_cons4_co1o24cres_2dent__dé1a2_dé1io_dé1o23d2hal4dres__dy2s3_en1a2'en1a2_en1o2'en1o2extra12fent_4fles_4fres_2gent_4gles_wa2g3n4gnes_4gres_4gues_hémi1éi1algircil4lucil4ll3lionémil4lrmil4lavil4luvil4l_in1a2'in1a2_in1e2'in1e2_in1é2'in1é2_in2er'in2er_in1i2'in1i2_in1o2'in1o2_in1u2'in1u22jent_2kent_2lent__mé2sa1m2nès2nent_1octeto1ionioxy1a22pent_pé2nul4phes_4phle_4phre_4ples_1p2neu4pres_1p2tèr1p2tér4ques__ré1a2_ré1é2_ré1e2_ré2el_ré2er_ré2èr_ré1i2_ré1o2_re1s22rent_4rhes_1s2cope2s3ch4sche_2sent_4shes_2s3hom1s2lav1s2lov1s2porsub1s22tent_4thes_4thre_4tres_u2s3tr2vent_4vres_2went_2xent_y1asthy1algi2zent_",
		7: "_ab3réa'ab3réaa1è2dre1alcoola2s3tro_bi1a2c_bi1a2t_bio1a22blent_2brent_é3cent_2chent_4chles_4chres_2ckent_2clent_co2nurb2crent_é3dent__dé3s2c_dé2s1œ_dé3s2p_dé3s2t3d2houd_di1ald_di1e2n_di2s3h2dlent_2drent_1é2drie1é2nerge2s3copextra2cextra2i2flent_2frent_2glent_a2g3nos'i2g3né_i2g3né'i2g3ni_i2g3ni2gnent_2grent_2guent_hypera2hypere2hyperé2hyperi2hypero2hypers2hype4r1hyperu2hypo1a2hypo1e2hypo1é2hypo1i2hypo1o2hypo1s2hypo1u2i1arthri1è2drevacil4lmil4letsemil4larmil5lcapil3lpupil3lpiril3lthril3lcyril3libril3lpusil3l_stil3luevil4l_in2ept'in2ept_in2i3q'in2i3q_in2i3t'in2i3t_in2ond'in2ond_in2uit'in2uit_in2u3l'in2u3lio1a2cti1s2tatla2w3re_ma2c3k_ma2r1x_mé3san_mé2s1iâ2ment_è2ment_l2ment_ô2ment_1m2némo1m2nésin3s2at_'2octeto1è2dreomni1s2o1s2taso1s2tato1s2timo1s2tom_oua1ou'oua1ou_pen2ta_per1a2_per1e2_per1é2_per1i2_per1o2_per1u22phent_4phles_4phres_3ph2tis2plent_poly1a2poly1e2poly1é2poly1è2poly1i2poly1o2poly1s2poly1u22prent__pré1a2_pré2au_pré1é2_pré1e2_pré1i2_pré1o2_pré1u2_pré1s2_pro1é21p2sych2quent__ré2aux_re2s3s_re2s3t_ré2ussé3rent_2r3heur2r3hydr1s2caph1s2cléri2s3ché4sches__seu2le2shent_1s2perm1s2phèr1s2phér1s2piel1s2tein1s2tigm1s2tock1s2tylesupero2supe4r1supers2su3r2ah_su2r3htélé1e2télé1i2télé1s22t3heur4thres_2trent_tung2s3uni1o2vuni1a2x2vrent_y1s2tom",
		8: "_ae3s4ch'ae3s4ch'2alcoola2l1algi_anti1a2'anti1a2_anti1e2'anti1e2_anti1é2'anti1é2_anti1s2'anti1s2apo2s3tr_bi2s1a2ca3ou3t2ja3cent_ac3cent_es3cent_is3cent_co1assocco1assur_dés2a3m_dé2s1é2_dé2s1i2di2s3cop_di1a2cé_di1a2mi_dy2s1a2_dy2s1i2_dy2s1o2_dy2s1u21é2lectre2n1i2vr_eu2r1a2'eu2r1a2eu1s2tatré3gent_'a2g3nat_a2g3nato2g3nosipu2g3nac_sta2g3nhémo1p2tpapil3lapapil3lepapil3lidistil3linstil3lfritil3lboutil3lchevil4l'inte4r3_intera2'intera2_intere2'intere2_interé2'interé2_interi2'interi2_intero2'intero2_inte4r3_interu2'interu2_inters2'inters2re3lent_ru3lent__ma2l1ap_ma2l1en_ma2l1oc_mé2g1oh_mé2s1esda2ment_fa2ment_ra2ment_ta2ment_ai2ment_mi2ment_ri2ment_om2ment_to2ment_ar2ment_er2ment_or2ment_as2ment_au2ment_fu2ment_hu2ment_su2ment_tu2ment__mono1a2_mono1e2_mono1é2_mono1i2_mono1o2_mono1u2_mono1s2n3s2ats_o2b3longombud2s3o1s2téroo1s2trad_ovi1s2c'ovi1s2cpaléo1é2_pa2n1is_para1s2_pa2r3hére3pent_pé1r2é2q_péri1os_péri1s2_péri1u2photo1s23ph2talé_pluri1apo1astre_pon2tet_pos2t3h_pos2t3r_post1s2_pud1d2lé3quent_radio1a2_ré2a3le_ré2i3fi_re3s4tr_re3s4tu_re3s4tyi2s3chiai2s3chioab3sent_1s2patia1s2piros1s2tomos1s2troph_su2b1a2_su2b1é2_su2b1in_su2b3lu_su2b1ur_su2r1a2_su2r1e2_su3r2et_su2r1é2_su2r1of_su2r1oxtachy1a2tchin3t2télé1o2btélé1o2ptran2s3htran2s3p_tri1a2c_tri1a2n_tri1a2t_tri1o2n",
		9: "_ana3s4tr'ana3s4tr_apo2s3ta'apo2s3ta_ci2s1alp_co2o3liecci3dent_tri3dent__ar3dent_pru3dent__dé3s2ert_dé3s2exu_dé3s2i3d_dé3s2i3r_dé3s2ist_dé3s2o3l_dé3s2orm_dé3s2orp_dé2s1u2n_di1a2cid_di1a2tom1é2drique1é2lémentépi2s3coptan3gent_rin3gent__ar3gent_'ar3gent_ser3gent_ter3gent_co2g3niti_ma2g3numpapil3lomvanil3linvanil3lis1informat_in2a3nit'in2a3nit_in2augur'in2augur_in2effab'in2effab_in2exora'in2exora_in2o3cul'in2o3cul_in1s2tab'in1s2tab_ta3lent_iva3lent__do3lent_opu3lent__ma2l1a2v_ma2l1int_ma2l1o2d_mé2s1u2scla2ment_qua2ment_rai3ment_abî2ment_éci2ment_éli2ment_ani2ment_fir2ment_écu2ment_llu2ment_plu2ment_bou2ment_bru2ment__milli1am_no2n1obso1s2tratu_pa2n1a2f_pa2n1opt_ar3pent_'ar3pent_ser3pent__péri2s3s_pos2t1in_pos2t1o2_pré2a3la_pro1s2cépro2s3tat_prou3d2h_ré2a3lis_ré2a3lit_re2s3cap_re2s3cou_re2s3cri_re2s3pir_re3s4tab_re3s4tag_re3s4tat_re3s4tén_re3s4tér_re3s4tim_re3s4tip_re3s4toc_re3s4top_rétro1a2_pa3rent_tor3rent_cur3rent_sesqui1a2pré3sent_stéréo1s21s2tructu_su3b2alt_su3b2é3r_su2b3lin_su3r2a3t_su3r2eau_su3r2ell_su2r1i2m_su2r1inf_su2r1int_la3tent__pa3tent_éni3tent_mit3tent_thermo1s2tran2s1a2tran2s1o2tran2s1u2vélo1s2kivol2t1amp",
		10: "_amino1a2c'amino1a2c_anti2enne'anti2enneréti3cent_inno3cent_chlo2r3a2cchlo2r3é2t_dacryo1a2déca3dent_inci3dent_impu3dent__dé3s2a3cr_dé3s2astr_dé3s2é3gr_dé3s2i3gn_dé3s2i3li_dé3s2invo_dé3s2o3dé_dé3s2oufrépi3s4copeindi3gent_dili3gent_o2g3nomonipu2g3nable_on3guent_'on3guent_'2informat_in2i3miti'in2i3mitiindo3lent_inso3lent_fécu3lent__macro1s2c_ma2l1aisé_méta1s2tacarê2ment_ryth2ment_vidi2ment_reli2ment_veni2ment_inti2ment_esti2ment_flam2ment_gram2ment__gem2ment__com3ment_chro2ment__sar3ment__ser3ment__mono1ï2démon2t3réalmoye2n1â2gréma3nent_imma3nent__émi3nent_immi3nent__pa2n1a2mé_pa2n1a2ra_pa2n1o2ph_péri2s3taélo3quent__re2s3cisi_re2s3ciso_re2s3pect_re2s3pons_re2s3quil_re3s4tand_re4s5trinappa3rent__res3sent_1s2tandardimpo3tent_tran3s2acttran3s2ats_sou3vent_",
		11: "1a2nesthésiarchi1é2pisimmis4cent__contre1s2cconfi3dent_dissi3dent_chien3dent__dé3s2ensib_dé3s2i3nen_dé3s2o3pilentre3gent_indul3gent_résur3gent__pro2g3nath_syn2g3nath_in2é3lucta'in2é3lucta_in2é3narra'in2é3narraturbu3lent_succu3lent_trucu3lent_corpu3lent_sporu4lent__ma2l1a2drotesta3ment_subli2ment_détri3ment_nutri3ment_slalo2ment_fichu3ment_perma3nent_conti3nent_perti3nent_absti3nent__pa2r1a2che_pa2r1a2chè_phalan3s2t_psycho1a2n_re2s3plend_re4s5trein_re4s5trict_su2b3limincompé3tent_mécon3tent_conni3vent_",
		12: "'2a2nesthési_bai2se3mainmunifi3cent__dé3s2a3tellcontin3gent__ma2g3nicideéquiva4lent_monova3lent_polyva3lent__ma2l1a2dresamalga2ment_préémi3nent_proémi3nent_surémi3nent_o1s2trictionomnipo3tent_équipo3tent_",
		13: "acquies4cent_intelli3gent__ma2g3nificattempéra3ment_antifer3ment_transpa3rent_",
		14: "privatdo3cent__contre3maîtrediaphrag2ment_ventripo3tent_privatdo3zent_",
		15: "grandilo3quent_",
		16: "_chè2vre3feuille",
	},
	exceptions: "",
};
export default patterns;
