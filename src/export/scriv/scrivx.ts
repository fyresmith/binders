import { attr, creator, scrivDate, uuid, xml } from './parts';

/* The `.scrivx` (the binder: one XML file) and `Settings/compile.xml`, as text. The order of the elements and their
   attributes are those of a project Scrivener 3.5.2 for Mac wrote from its Blank template; what a binder doesn't have
   (keywords, custom fields, a section type of an item's own) is not written at all, so a plain binder's project is
   element for element the one the maintainer's Scrivener opened. Pure. */

/** A document of the project, ready to be written down. */
export interface Doc {
	id: string;
	type: 'Folder' | 'Text' | 'Image';
	title: string;
	created: Date;
	modified: Date;
	included: boolean;
	label: number | null;
	status: number | null;
	/** Its section type's id, when it isn't the one the defaults give it. */
	section: string | null;
	target: number;
	/** Custom metadata: a field's id and its value. */
	fields: [string, string][];
	keywords: number[];
	/** A picture's ending (`png`, `jpg`). */
	extension?: string;
	children: Doc[];
}

export interface Lists {
	labels: { name: string; color: string }[];
	statuses: string[];
	keywords: string[];
	/** Custom metadata fields: an id and a title each (the Binders path first). */
	fields: [string, string][];
	/** Section types: an id and a name each; and the two the defaults give (to a folder, to a text). */
	types: [string, string][];
	folderType: string;
	textType: string;
}

function item(d: Doc, depth: number): string {
	const pad = '    '.repeat(depth), meta: string[] = [];
	if (d.label != null) meta.push(`<LabelID>${d.label}</LabelID>`);
	if (d.status != null) meta.push(`<StatusID>${d.status}</StatusID>`);
	// Left out of compile: Scrivener's own files leave the element out. No file written by Scrivener says "No".
	if (d.included) meta.push('<IncludeInCompile>Yes</IncludeInCompile>');
	if (d.section) meta.push(`<SectionType>${d.section}</SectionType>`);
	if (d.type === 'Image') meta.push(`<FileExtension>${xml(d.extension ?? 'png')}</FileExtension>`, '<ShowSynopsisImage>Yes</ShowSynopsisImage>');
	if (d.fields.length) meta.push('<CustomMetaData>', ...d.fields.flatMap(([id, value]) => ['    <MetaDataItem>', `        <FieldID>${xml(id)}</FieldID>`, `        <Value>${xml(value)}</Value>`, '    </MetaDataItem>']), '</CustomMetaData>');
	const out = [
		`${pad}<BinderItem UUID="${d.id}" Type="${d.type}" Created="${scrivDate(d.created)}" Modified="${scrivDate(d.modified)}">`,
		`${pad}    <Title>${xml(d.title)}</Title>`,
		`${pad}    <MetaData>`, ...meta.map((m) => `${pad}        ${m}`), `${pad}    </MetaData>`,
	];
	if (d.type === 'Image') out.push(`${pad}    <MediaSettings>`, `${pad}        <ImageScaleFactor>1.0</ImageScaleFactor>`, `${pad}        <ImageRotation>None</ImageRotation>`, `${pad}        <ImageScalesProportionally>Yes</ImageScalesProportionally>`, `${pad}    </MediaSettings>`);
	else out.push(`${pad}    <TextSettings>`, `${pad}        <TextSelection>0,0</TextSelection>`, ...(d.target ? [`${pad}        <Target Type="Words" Notify="No">${d.target}</Target>`] : []), `${pad}    </TextSettings>`);
	if (d.keywords.length) out.push(`${pad}    <Keywords>`, ...d.keywords.map((k) => `${pad}        <KeywordID>${k}</KeywordID>`), `${pad}    </Keywords>`);
	if (d.children.length) out.push(`${pad}    <Children>`, ...d.children.map((c) => item(c, depth + 2)), `${pad}    </Children>`);
	out.push(`${pad}</BinderItem>`);
	return out.join('\n');
}

export interface Scrivx {
	/** What the ids are made from: the binder's path in the vault. */
	ns: string;
	version: string;
	when: Date;
	draft: Doc[];
	research: Doc[];
	lists: Lists;
	/** The whole binder's target, and what the draft has now. */
	target: number;
	words: number;
	chars: number;
}

/** The three folders every project has, by the type Scrivener gives each. */
export const ROOTS: [string, string][] = [['DraftFolder', 'Draft'], ['ResearchFolder', 'Research'], ['TrashFolder', 'Trash']];
export const rootId = (ns: string, type: string): string => uuid(ns, `root:${type}`);

export function scrivx(p: Scrivx): string {
	const { ns, when, lists } = p, now = scrivDate(when), id = (key: string) => uuid(ns, key);
	const root = (type: string, title: string, kids: Doc[]) => [
		`        <BinderItem UUID="${rootId(ns, type)}" Type="${type}" Created="${now}" Modified="${now}">`,
		`            <Title>${title}</Title>`,
		'            <MetaData>', '                <IncludeInCompile>Yes</IncludeInCompile>', '            </MetaData>',
		...(kids.length ? ['            <Children>', ...kids.map((k) => item(k, 4)), '            </Children>'] : []),
		'        </BinderItem>',
	].join('\n');
	const tomorrow = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1);
	const kids = [p.draft, p.research, []];
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<ScrivenerProject Identifier="${id('project')}" Version="2.0" Creator="${attr(creator(p.version))}" Device="Binders" Author="" Modified="${now}" ModID="${id(`mod:${when.toISOString()}`)}">`,
		'    <Binder>', ...ROOTS.map(([type, title], i) => root(type, title, kids[i])), '    </Binder>',
		'    <Collections>',
		`        <Collection Type="Binder" ID="${id('collection:binder')}" Color="0.974804 0.974804 0.974804">`, '            <Title>Binder</Title>', '        </Collection>',
		`        <Collection Type="RecentSearch" ID="${id('collection:search')}" Color="0.922173 0.818612 0.999627">`, '            <Title>Search Results</Title>', '        </Collection>',
		'    </Collections>',
		...(lists.keywords.length ? ['    <Keywords>', ...lists.keywords.flatMap((k, i) => [`        <Keyword ID="${i}" Color="0.67 0.67 0.67">`, `            <Title>${xml(k)}</Title>`, '        </Keyword>']), '    </Keywords>'] : []),
		'    <SectionTypes>',
		'        <TypeDefinitions>', ...lists.types.map(([tid, name]) => `            <Type ID="${tid}">${xml(name)}</Type>`), '        </TypeDefinitions>',
		'        <LevelTypes>',
		'            <Folders>', `                <Type>${lists.folderType}</Type>`, '            </Folders>',
		'            <Containers>', `                <Type>${lists.textType}</Type>`, '            </Containers>',
		'            <Files>', `                <Type>${lists.textType}</Type>`, '            </Files>',
		'        </LevelTypes>',
		'    </SectionTypes>',
		'    <LabelSettings>', '        <Title>Label</Title>', '        <DefaultLabelID>-1</DefaultLabelID>',
		'        <Labels>', '            <Label ID="-1">No Label</Label>', ...lists.labels.map((l, i) => `            <Label ID="${i}" Color="${l.color}">${xml(l.name)}</Label>`), '        </Labels>',
		'    </LabelSettings>',
		'    <StatusSettings>', '        <Title>Status</Title>', '        <DefaultStatusID>-1</DefaultStatusID>',
		'        <StatusItems>', '            <Status ID="-1">No Status</Status>', ...lists.statuses.map((s, i) => `            <Status ID="${i}">${xml(s)}</Status>`), '        </StatusItems>',
		'    </StatusSettings>',
		'    <CustomMetaDataSettings>', ...lists.fields.flatMap(([fid, title]) => [`        <MetaDataField ID="${attr(fid)}" Type="Text" Wraps="No" Align="Left">`, `            <Title>${xml(title)}</Title>`, '        </MetaDataField>']), '    </CustomMetaDataSettings>',
		'    <ProjectTargets Notify="No">',
		`        <DraftTarget Type="Words" CountIncludedOnly="Yes" CurrentCompileGroupOnly="No" Deadline="${now}" IgnoreDeadline="Yes">${p.target}</DraftTarget>`,
		`        <SessionTarget Type="Words" CountDraftOnly="Yes" AllowNegatives="Yes" NextResetDate="${scrivDate(tomorrow)}" ResetType="Time" ResetTime="00:00" DeterminedFromDeadline="No" WritingDays="" CanWriteOnDeadlineDate="No">0</SessionTarget>`,
		`        <PreviousSession Words="${p.words}" Characters="${p.chars}" Date="${now}"/>`,
		'    </ProjectTargets>',
		`    <RecentWritingHistory Date="${now}">`, `        <DraftWordCount>${p.words}</DraftWordCount>`, `        <DraftCharCount>${p.chars}</DraftCharCount>`, '        <OtherWordCount>0</OtherWordCount>', '        <OtherCharCount>0</OtherCharCount>', '    </RecentWritingHistory>',
		'    <PrintSettings PaperSize="612.0,792.0" LeftMargin="72.0" RightMargin="72.0" TopMargin="90.0" BottomMargin="90.0" PaperType="na-letter" Orientation="Portrait" HorizontalPagination="Clip" VerticalPagination="Auto" ScaleFactor="1.0" HorizontallyCentered="Yes" VerticallyCentered="Yes" Collates="Yes" PagesAcross="1" PagesDown="1"/>',
		'</ScrivenerProject>', '',
	];
	return lines.join('\n');
}

/** `Settings/compile.xml`, as Scrivener 3.5.2 writes it for a Blank project: which layout of the format in use each
    section type gets, so its Compile works on the project without asking first. */
export function compileXml(title: string, language: string, layouts: [string, string][]): string {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>', '<CompileSettings>', '    <ProjectSettings>',
		'        <Content Scope="Included">', '            <Filter State="Off" Exclude="No" Type="Label">', '                <Label>-1</Label>', '                <Status>-1</Status>', '            </Filter>', '        </Content>',
		'        <Options>', '            <RemoveComments>Yes</RemoveComments>', '            <RemoveAnnotations>Yes</RemoveAnnotations>', '            <ResampleImages DPI="72">No</ResampleImages>', '            <ConvertTablesAndListToMMD>Yes</ConvertTablesAndListToMMD>', '        </Options>',
		'        <MetaData>', `            <ProjectTitle>${xml(title)}</ProjectTitle>`, `            <ProjectAbbreviatedTitle>${xml(title)}</ProjectAbbreviatedTitle>`,
		'            <Authors>', '                <Author Role="aut"></Author>', '            </Authors>', `            <EbookLanguage>${xml(language)}</EbookLanguage>`, '        </MetaData>',
		'    </ProjectSettings>', '    <CurrentFileType>Print</CurrentFileType>',
		'    <FormatSettings>', '        <Format ID="DEFAULT">', '            <SectionLayouts>', ...layouts.map(([id, layout]) => `                <Type ID="${id}">${layout}</Type>`), '            </SectionLayouts>', '        </Format>', '    </FormatSettings>',
		'    <LastUsedFormats/>', '</CompileSettings>', '',
	].join('\n');
}
