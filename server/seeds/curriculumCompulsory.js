/**
 * Official NCTB Compulsory Curriculum Dataset (Class 9 - 12)
 * Subjects:
 * - SSC Bangla 1st Paper
 * - SSC Bangla 2nd Paper
 * - SSC English 1st Paper
 * - SSC English 2nd Paper
 * - SSC Religion & Moral Education
 * - SSC Bangladesh & Global Studies
 * - HSC Bangla 1st Paper
 * - HSC Bangla 2nd Paper
 * - HSC English 1st Paper
 * - HSC English 2nd Paper
 */

// SSC Bangla 1st Paper (Class 9 & 10)
const sscBangla1 = [
    // গদ্য (Prose)
    { chapterNumber: 1, chapterName: 'গদ্য: শোভা - রবীন্দ্রনাথ ঠাকুর', topics: [{ name: 'গল্পের মূলভাব, চরিত্র বিশ্লেষণ ও প্রেক্ষাপট', subTopics: ['প্রতিবন্ধী বালিকার অন্তর্জগৎ', 'প্রকৃতির সাথে মিতালী', 'পরিবারের অবহেলা ও সমাজ বাস্তবতা'] }] },
    { chapterNumber: 2, chapterName: 'গদ্য: বই পড়া - প্রমথ চৌধুরী', topics: [{ name: 'শিক্ষা বনাম সাহিত্যচর্চা ও লাইব্রেরির গুরুত্ব', subTopics: ['স্বশিক্ষিত হওয়ার প্রয়োজনীয়তা', 'ডিগ্রি অর্জন বনাম জ্ঞান অর্জন', 'লাইব্রেরির স্থান স্কুলের চেয়ে উপরে'] }] },
    { chapterNumber: 3, chapterName: 'গদ্য: অভাগীর স্বর্গ - শরৎচন্দ্র চট্টোপাধ্যায়', topics: [{ name: 'সামাজিক বৈষম্য ও কাঙ্গালীর মাতৃভক্তি', subTopics: ['সামন্ততান্ত্রিক মানসিকতা ও জাতপ্রথা', 'দরিদ্র জীবনের করুণ চিত্র', 'অন্তিম সংস্কারের আকুতি'] }] },
    { chapterNumber: 4, chapterName: 'গদ্য: পল্লীসাহিত্য - ড. মুহম্মদ শহীদুল্লাহ', topics: [{ name: 'লোকসাহিত্য ও পল্লী সংস্কৃতির সংরক্ষণ', subTopics: ['পল্লীগীতি, রূপকথা ও ডাকের কথা', 'মনসুর বয়াতি ও মৈমনসিংহ গীতিকা', 'আধুনিক সাহিত্যে পল্লীসাহিত্যের উপাদান'] }] },
    { chapterNumber: 5, chapterName: 'গদ্য: আম-আঁটির ভেঁপু - বিভূতিভূষণ বন্দ্যোপাধ্যায়', topics: [{ name: 'পল্লী প্রকৃতিতে অপু-দুর্গার শৈশব', subTopics: ['ভাই-বোনের নিবিড় স্নেহ', 'পল্লীর দরিদ্র সংসার ও রোমাঞ্চ', 'প্রকৃতির সান্নিধ্যে আনন্দ'] }] },
    { chapterNumber: 6, chapterName: 'গদ্য: মানুষ মুহাম্মদ (সা.) - মোহাম্মদ ওয়াজেদ আলী', topics: [{ name: 'নবীর মানবিক গুণাবলী ও ঐতিহাসিক চরিত্র', subTopics: ['ক্ষমা ও উদারতার পরাকাষ্ঠা', 'হিজরত ও সত্যের প্রচার', 'মানবিক দৃষ্টিভঙ্গি'] }] },
    { chapterNumber: 7, chapterName: 'গদ্য: নিমগাছ - বনফুল (বলাইচাঁদ মুখোপাধ্যায়)', topics: [{ name: 'প্রতীকাশ্রয়ী গল্প ও গৃহবধূর ত্যাগের মহিমা', subTopics: ['নিমগাছের উপকারিতা ও অবহেলা', 'সংসার জালে আবদ্ধ গৃহবধূ', 'ম্যাজিক বাক্য ও গভীর জীবনবোধ'] }] },
    { chapterNumber: 8, chapterName: 'গদ্য: শিক্ষা ও মনুষ্যত্ব - মোতাহের হোসেন চৌধুরী', topics: [{ name: 'জীবসত্তা ও মানবসত্তার বিকাশ', subTopics: ['মুক্তবুদ্ধি ও আত্মোন্নয়ন', 'ক্ষুৎপিপাসার নিবৃত্তি বনাম আত্মিক মুক্তি', 'লেফাফাদোরস্তি ও আসল মনুষ্যত্ব'] }] },
    { chapterNumber: 9, chapterName: 'গদ্য: প্রবাস বন্ধু - সৈয়দ মুজতবা আলী', topics: [{ name: 'আফগানিস্তানের অভিজ্ঞতা ও আবদুর রহমান', subTopics: ['অতিথিপরায়ণতা ও খাদ্যাভ্যাস', 'কাবুলের ভূপ্রকৃতি ও শীতকালীন জীবন', 'হাস্যরস ও প্রবাস স্মৃতি'] }] },
    { chapterNumber: 10, chapterName: 'গদ্য: একাত্তরের দিনগুলি - জাহানারা ইমাম', topics: [{ name: 'মুক্তিযুদ্ধের স্মৃতি ও শহীদ জননীর দিনলিপি', subTopics: ['১৯৭১ এর অবরুদ্ধ ঢাকা', 'মুক্তিযোদ্ধাদের গেরিলা অপারেশন', 'রুমি ও শহীদদের আত্মত্যাগ'] }] },
    // কবিতা (Poetry)
    { chapterNumber: 11, chapterName: 'কবিতা: কপোতাক্ষ নদ - মাইকেল মধুসূদন দত্ত', topics: [{ name: 'স্মৃতিকাতরতা ও স্বদেশপ্রেম', subTopics: ['চতুর্দশপদী কবিতার আঙ্গিক', 'ফ্রান্সে বসে স্বদেশের নদীস্মৃতি', 'নদের কাছে কবির বিনীত নিবেদন'] }] },
    { chapterNumber: 12, chapterName: 'কবিতা: জীবন-সঙ্গীত - হেমচন্দ্র বন্দ্যোপাধ্যায়', topics: [{ name: 'জীবনের বাস্তব লক্ষ্য ও কর্মপ্রেরণা', subTopics: ['মানব জীবনের মহিমা', 'কর্মের মাধ্যমে চিরস্মরণীয় হওয়া', 'জগতের রণক্ষেত্রে বীরত্ব প্রদর্শন'] }] },
    { chapterNumber: 13, chapterName: 'কবিতা: জুতা-আবিষ্কার - রবীন্দ্রনাথ ঠাকুর', topics: [{ name: 'ধূলিমুক্ত করার কৌশল ও চর্মকারের বুদ্ধিমত্তা', subTopics: ['রাজা হবু ও মন্ত্রী গোবুর কথোপকথন', 'পণ্ডিত ও বিজ্ঞানীদের নিষ্ফল প্রচেষ্টা', 'চর্মকার কুলপতির সহজ সমাধান'] }] },
    { chapterNumber: 14, chapterName: 'কবিতা: ঝিঙে ফুল - কাজী নজরুল ইসলাম', topics: [{ name: 'প্রকৃতিপ্রেম ও শ্যামল বাংলার সৌন্দর্য', subTopics: ['মৃদু বাতাসে ঝিঙে ফুলের প্রস্ফুটন', 'মাটির প্রতি ভালোবাসা', 'নজরুলের প্রকৃতি ভাবনা'] }] },
    { chapterNumber: 15, chapterName: 'কবিতা: পল্লীজননী - জসীমউদ্দীন', topics: [{ name: 'পল্লীমায়ের শাশ্বত মমত্ব ও রুগ্ন সন্তানের আর্তি', subTopics: ['দরিদ্র ঘরের অন্ধকার পরিবেশ', 'পুত্রের সুস্থতার জন্য মায়ের মানত', 'শাশ্বত মাতৃত্বের করুণ আলেখ্য'] }] },
    { chapterNumber: 16, chapterName: 'কবিতা: রানার - সুকান্ত ভট্টাচার্য', topics: [{ name: 'শ্রমজীবী মানুষের দায়বদ্ধতা ও ত্যাগ', subTopics: ['চিঠির বোঝা বয়ে রানারের ছুটে চলা', 'রাত্রির ক্লান্তি ও দায়িত্ববোধ', 'সাম্যবাদী মানবিক সমাজচেতনা'] }] },
    { chapterNumber: 17, chapterName: 'কবিতা: তোমাকে পাওয়ার জন্যে, হে স্বাধীনতা - শামসুর রাহমান', topics: [{ name: 'মুক্তিযুদ্ধের বলিদান ও স্বাধীনতার প্রত্যাশা', subTopics: ['সখিনা বিবির কপাল ভাঙা', 'হরিদাসীর সিঁথির সিঁদুর মোছা', 'জনগণের সার্বিক প্রতিরোধ'] }] },
    { chapterNumber: 18, chapterName: 'কবিতা: সাহসী জননী বাংলা - কামাল চৌধুরী', topics: [{ name: 'বাঙালির প্রতিরোধ সংগ্রাম ও বিজয়', subTopics: ['হানাদারদের বর্বরতা', 'বাঙালির অস্ত্র হাতে গর্জে ওঠা', 'বিজয়ের সূর্যোদয়'] }] },
    // সহপাঠ (Novels & Drama)
    { chapterNumber: 19, chapterName: 'সহপাঠ উপন্যাস: কাকতাড়ুয়া - সেলিনা হোসেন', topics: [{ name: 'বুধার মুক্তিযুদ্ধ ও গ্রামীণ প্রতিরোধ', subTopics: ['বুধার নিঃসঙ্গ শৈশব ও ডাকনাম', 'পাকিস্তানি ক্যাম্প ও বাংকারে আগুন', 'স্বাধীনতার প্রতীক বুধা'] }] },
    { chapterNumber: 20, chapterName: 'সহপাঠ নাটক: বহিপীর - সৈয়দ ওয়ালীউল্লাহ', topics: [{ name: 'ধর্মব্যবসা বনাম মানবিক চেতনার দ্বন্দ্ব', subTopics: ['বহিপীরের প্রভাব ও স্বার্থসিদ্ধি', 'তাহেরার আত্মমর্যাদা ও প্রতিবাদ', 'হাতেম আলী ও জমিদারি সংকট', 'হাশেম আলীর সমর্থন'] }] }
];

// SSC Bangla 2nd Paper (Class 9 & 10)
const sscBangla2 = [
    { chapterNumber: 1, chapterName: 'অধ্যায় ১: ভাষা ও বাংলা ভাষা', topics: [{ name: 'ভাষার প্রকৃতি, উৎস ও উপভাষা', subTopics: ['মাতৃভাষা ও রাষ্ট্রভাষা', 'সাধু ও চলিত রীতির পার্থক্য', 'বাংলা ভাষার ঐতিহাসিক উৎস'] }] },
    { chapterNumber: 2, chapterName: 'অধ্যায় ২: বাংলা ব্যাকরণ ও ধ্বনিতত্ত্ব', topics: [{ name: 'ধ্বনি, বর্ণ ও স্বর-ব্যঞ্জন ধ্বনি', subTopics: ['ধ্বনি পরিবর্তনের কারণ ও প্রকারভেদ', 'উচ্চারণ স্থান অনুযায়ী ধ্বনির শ্রেণিবিন্যাস', 'ণ-ত্ব ও ষ-ত্ব বিধান'] }] },
    { chapterNumber: 3, chapterName: 'অধ্যায় ৩: শব্দ ও পদ প্রকরণ', topics: [{ name: 'শব্দ গঠন, সন্ধি, উপসর্গ ও সমাস', subTopics: ['স্বরসন্ধি ও ব্যঞ্জনসন্ধি', 'উপসর্গের শ্রেণি ও অর্থদ্যোতকতা', 'সমাসের প্রকারভেদ ও ব্যাসবাক্য', 'অনুসর্গ ও প্রত্যয়'] }] },
    { chapterNumber: 4, chapterName: 'অধ্যায় ৪: পদ পরিচয় ও ব্যাকরণিক শ্রেণি', topics: [{ name: 'বিশেষ্য, বিশেষণ, সর্বনাম, ক্রিয়া ও অব্যয়', subTopics: ['ক্রিয়ার কাল ও ভাব', 'পুরুষ ও অনুজ্ঞা', 'কারক ও বিভক্তি', 'যোজক ও আবেগ শব্দ'] }] },
    { chapterNumber: 5, chapterName: 'অধ্যায় ৫: বাক্য ও বাচ্য প্রকরণ', topics: [{ name: 'বাক্যের গুণাবলী, গঠন ও রূপান্তর', subTopics: ['আকাঙ্ক্ষা, আসত্তি ও যোগ্যতা', 'সরল, জটিল ও যৌগিক বাক্য রূপান্তর', 'বাচ্য (কর্তৃ, কর্ম, ভাববাচ্য) ও উক্তি পরিবর্তন'] }] },
    { chapterNumber: 6, chapterName: 'অধ্যায় ৬: বাগধারা, বিপরীত ও সমার্থক শব্দ', topics: [{ name: 'শব্দ সম্ভার ও প্রায়োগিক রূপ', subTopics: ['বাগধারা ও প্রবাদ-প্রবচন', 'সমোচ্চারিত ভিন্নার্থক শব্দ', 'বিপরীতার্থক ও প্রতিশব্দ'] }] },
    { chapterNumber: 7, chapterName: 'অধ্যায় ৭: নির্মিতি অংশ (Composition)', topics: [{ name: 'ভাবসম্প্রসারণ, সারাংশ, পত্র ও প্রতিবেদন রচনা', subTopics: ['ভাবসম্প্রসারণ লিখন কৌশল', 'সারাংশ ও সারমর্ম লিখন', 'আবেদনপত্র ও প্রাতিষ্ঠানিক পত্র', 'সংবাদ প্রতিবেদন ও প্রবন্ধ রচনা'] }] }
];

// SSC English 1st Paper (Class 9 & 10)
const sscEnglish1 = [
    { chapterNumber: 1, chapterName: 'Unit 1: Good Citizens', topics: [{ name: 'Rights, Responsibilities and Citizenship', subTopics: ['Knowing your rights', 'Being a good neighbor', 'Duties towards society and state'] }] },
    { chapterNumber: 2, chapterName: 'Unit 2: Pastimes', topics: [{ name: 'Hobbies, Leisure and Physical Fitness', subTopics: ['Traditional sports of Bangladesh', 'Leisure activities around the world', 'Fitness and health benefits'] }] },
    { chapterNumber: 3, chapterName: 'Unit 3: Events and Festivals', topics: [{ name: 'National and Cultural Celebrations', subTopics: ['International Mother Language Day (21st February)', 'Independence Day (26th March)', 'Victory Day (16th December)', 'Pahela Baishakh'] }] },
    { chapterNumber: 4, chapterName: 'Unit 4: Are We Aware?', topics: [{ name: 'Social and Environmental Awareness', subTopics: ['Ferry accident & traffic awareness', 'Pollution and civic duties', 'Deforestation and wildlife protection'] }] },
    { chapterNumber: 5, chapterName: 'Unit 5: Nature and Humanity', topics: [{ name: 'Climate Change, Rivers and Environment', subTopics: ['The greed of the roaring rivers', 'Environmental pollution', 'Return to nature'] }] },
    { chapterNumber: 6, chapterName: 'Unit 7: People Who Stand Out', topics: [{ name: 'Inspirational Personalities', subTopics: ['Zainul Abedin - Great Art Master', 'Pritilata Waddedar', 'Mother Teresa - The Angel of Love'] }] },
    { chapterNumber: 7, chapterName: 'Unit 8: World Heritage', topics: [{ name: 'Historical Monuments & Natural Heritage', subTopics: ['The Shat Gombuj Mosque', 'The Somapura Mahavihara', 'The Sundarbans - World Heritage Site'] }] },
    { chapterNumber: 8, chapterName: 'Unit 10: Dreams', topics: [{ name: 'Personal and National Aspirations', subTopics: ['They had dreams (Zahir Raihan)', 'I have a dream (Martin Luther King Jr.)', 'Youth aspirations'] }] },
    { chapterNumber: 9, chapterName: 'Unit 11: Renewable Energy', topics: [{ name: 'Energy Crisis and Green Solutions', subTopics: ['Solar energy and wind energy', 'Fossil fuels vs Clean energy', 'Power of the future'] }] },
    { chapterNumber: 10, chapterName: 'Writing Skills & Guided Composition', topics: [{ name: 'Paragraphs, Stories, Graphs and Informal Letters', subTopics: ['Answering comprehension questions', 'Information transfer & summary writing', 'Describing graphs and charts', 'Story completion and formal/informal letters'] }] }
];

// SSC English 2nd Paper (Class 9 & 10)
const sscEnglish2 = [
    { chapterNumber: 1, chapterName: 'Chapter 1: Parts of Speech & Fill in the Blanks', topics: [{ name: 'Articles, Prepositions and Parts of Speech', subTopics: ['Definite & indefinite articles', 'Appropriate prepositions', 'Fill in the blanks with and without clues'] }] },
    { chapterNumber: 2, chapterName: 'Chapter 2: Right Form of Verbs & Subject-Verb Agreement', topics: [{ name: 'Rules of Verbs and Concord', subTopics: ['Tense and verb forms', 'Subject-verb concord rules', 'Conditionals and subjunctive'] }] },
    { chapterNumber: 3, chapterName: 'Chapter 3: Transformation of Sentences', topics: [{ name: 'Structural & Degree Transformations', subTopics: ['Affirmative to Negative, Assertive to Interrogative/Exclamatory', 'Simple, Complex and Compound sentences', 'Positive, Comparative and Superlative degrees', 'Active and Passive Voice'] }] },
    { chapterNumber: 4, chapterName: 'Chapter 4: Completing Sentences & Clauses', topics: [{ name: 'Conditional Clauses, Proverbs and Conjunctions', subTopics: ['First, Second and Third conditionals', 'So that, In order that, Lest, As if', 'Time and condition clauses'] }] },
    { chapterNumber: 5, chapterName: 'Chapter 5: Suffixes, Prefixes and Tag Questions', topics: [{ name: 'Affixes and Question Tags', subTopics: ['Forming nouns, adjectives, verbs and adverbs with affixes', 'Rules of tag questions with auxiliary and modal verbs', 'Imperative and exceptional tag rules'] }] },
    { chapterNumber: 6, chapterName: 'Chapter 6: Sentence Connectors and Punctuation', topics: [{ name: 'Linking Words, Capitalization and Punctuation Marks', subTopics: ['Cohesive sentence connectors (However, Moreover, Therefore)', 'Punctuation marks (Full stop, Comma, Colon, Semicolon)', 'Capital letters and quotation marks'] }] },
    { chapterNumber: 7, chapterName: 'Chapter 7: Writing Composition & Formal Letters', topics: [{ name: 'CV Writing, Formal Complaints and Paragraphs', subTopics: ['Curriculum Vitae (CV) with cover letter', 'Formal letter to principal and municipal authority', 'Cause-effect and comparative paragraphs'] }] }
];

// SSC Religion & Moral Education (Class 9 & 10 - Islam & Moral Education)
const sscReligion = [
    { chapterNumber: 1, chapterName: 'অধ্যায় ১: আকাইদ ও নৈতিক জীবন (Aqaid & Moral Life)', topics: [{ name: 'তাওহীদ, রিসালাত ও আখিরাত', subTopics: ['ইসলাম ও ঈমানের সংজ্ঞা', 'তাওহীদে বিশ্বাস ও শিরকের কুফল', 'রিসালাত ও খতমে নবুওয়্যাত', 'আসমাসুন নবী ও আসমাউল হুসনা', 'আখিরাত, কিয়ামত, হাশর, মিজান ও জান্নাত-জাহান্নাম'] }] },
    { chapterNumber: 2, chapterName: 'অধ্যায় ২: শরীয়তের উৎস (Sources of Shariah)', topics: [{ name: 'আল-কুরআন, সুন্নাহ, ইজমা ও কিয়াস', subTopics: ['কুরআন মাজিদ সংকলন ও সংরক্ষণের ইতিহাস', 'নির্বাচিত সুরা পাঠ ও ভাবার্থ (সুরা আশ-শামস, আদ-দুহা, আত-তীন)', 'হাদিস শরিফের পরিচয় ও নির্বাচিত হাদিসসমূহ', 'শরীয়তের বিধি-বিধানের মূলনীতি'] }] },
    { chapterNumber: 3, chapterName: 'অধ্যায় ৩: ইবাদত (Ibadah)', topics: [{ name: 'নামাজ, রোজা, হজ ও জাকাত', subTopics: ['ইবাদতের তাৎপর্য ও আত্মশুদ্ধি', 'সালাতের গুরুত্ব ও সামাজিক শিক্ষা', 'সাওম ও নৈতিক চরিত্র গঠন', 'জাকাত ও অর্থনৈতিক সমতা', 'হজের শিক্ষা ও বৈশ্বিক ভ্রাতৃত্ববোধ'] }] },
    { chapterNumber: 4, chapterName: 'অধ্যায় ৪: আখলাক (Akhlaq / Character)', topics: [{ name: 'সৎগুণাবলী (আখলাকে হামিদা) ও অসদাচরণ বর্জন', subTopics: ['সত্যবাদিতা, আমানতদারী ও ওয়াদা পালন', 'পিতামাতা ও প্রতিবেশীর অধিকার', 'অহংকার, পরনিন্দা ও লোভের অপকারিতা', 'দেশপ্রেম ও মানবসেবা'] }] },
    { chapterNumber: 5, chapterName: 'অধ্যায় ৫: আদর্শ জীবনচরিত (Ideal Biographies)', topics: [{ name: 'নবী-রাসূল ও খলিফাদের জীবন ও কর্ম', subTopics: ['মহানবী হযরত মুহাম্মদ (সা.) এর মক্কী ও মাদানী জীবন', 'খোলাফায়ে রাশেদীনের শাসন ব্যবস্থা (হযরত আবু বকর, উমর, উসমান ও আলী রা.)', 'মুসলিম মনীষীদের অবদান (ইবনে সিনা, আল-বিরুনি, আল-খোয়ারিজমি)'] }] }
];

// SSC Bangladesh & Global Studies (Class 9 & 10)
const sscBGS = [
    { chapterNumber: 1, chapterName: 'অধ্যায় ১: পূর্ব বাংলার আন্দোলন ও জাতীয়তাবাদের উত্থান (১৯৪৭-১৯৭০)', topics: [{ name: 'ভাষা আন্দোলন, যুক্তফ্রন্ট ও ৬-দফা', subTopics: ['১৯৫২ এর ভাষা আন্দোলন ও আন্তর্জাতিক স্বীকৃতি', 'যুক্তফ্রন্ট নির্বাচন ও ২১ দফা', 'ঐতিহাসিক ৬-দফা কর্মসূচি ও গণঅভ্যুত্থান', '১৯৭০ এর সাধারণ নির্বাচন'] }] },
    { chapterNumber: 2, chapterName: 'অধ্যায় ২: স্বাধীন বাংলাদেশ (১৯৭১)', topics: [{ name: 'বঙ্গবন্ধুর ৭ই মার্চের ভাষণ ও মহান মুক্তিযুদ্ধ', subTopics: ['অপারেশন সার্চলাইট ও গণহত্যা', 'স্বাধীনতার ঘোষণা ও মুজিবনগর সরকার', 'মুক্তিবাহিনী গঠন ও সেক্টরসমূহ', '১৬ই ডিসেম্বরের চূড়ান্ত বিজয় ও পাকিস্তান বাহিনীর আত্মসমর্পণ'] }] },
    { chapterNumber: 3, chapterName: 'অধ্যায় ৩: সৌরজগৎ ও ভূমণ্ডল', topics: [{ name: 'সৌরজগৎ, পৃথিবীর গতি ও দিবারাত্রি হ্রাস-বৃদ্ধি', subTopics: ['গ্রহ-উপগ্রহের পরিচয়', 'আহ্নিক গতি ও বার্ষিক গতির ফলাফল', 'অক্ষরেখা, দ্রাঘিমারেখা ও আন্তর্জাতিক তারিখ রেখা', 'জোয়ার-ভাটার কারণ ও প্রভাব'] }] },
    { chapterNumber: 4, chapterName: 'অধ্যায় ৪: বাংলাদেশের ভূপ্রকৃতি ও জলবায়ু', topics: [{ name: 'ভূপ্রাকৃতিক গঠন, ভূমিকম্প ও ঋতুচক্র', subTopics: ['টারশিয়ারি পাহাড়, প্লাইস্টোসিন সোপান ও প্লাবন সমভূমি', 'মৌসুমি বায়ুর প্রভাব ও কালবৈশাখী', 'ভূমিকম্পের কারণ ও সতর্কতামূলক প্রস্তুতি'] }] },
    { chapterNumber: 5, chapterName: 'অধ্যায় ৫: বাংলাদেশের নদ-নদী ও প্রাকৃতিক সম্পদ', topics: [{ name: 'নদীমাতৃক বাংলাদেশ ও পানি ব্যবস্থাপনা', subTopics: ['প্রধান নদ-নদীর উৎপত্তি ও গতিপথ', 'পানির অভাব ও আন্তর্জাতিক নদী সমস্যা', 'বনজ ও খনিজ সম্পদ (প্রাকৃতিক গ্যাস, কয়লা)'] }] },
    { chapterNumber: 6, chapterName: 'অধ্যায় ৬: রাষ্ট্র, নাগরিকতা ও আইন', topics: [{ name: 'রাষ্ট্রের উপাদান, সুনাগরিকের গুণাবলী ও আইন', subTopics: ['রাষ্ট্রের ৪টি অপরিহার্য উপাদান', 'সুনাগরিকের গুণাবলী (বুদ্ধি, আত্মসংযম, বিবেক)', 'আইনের উৎস ও আইনের অনুশাসন'] }] },
    { chapterNumber: 7, chapterName: 'অধ্যায় ৭: বাংলাদেশ সরকারের অঙ্গসমূহ ও প্রশাসন ব্যবস্থা', topics: [{ name: 'আইনসভা, শাসন বিভাগ ও বিচার বিভাগ', subTopics: ['রাষ্ট্রপতি ও প্রধানমন্ত্রীর ক্ষমতা ও কার্যাবলী', 'জাতীয় সংসদের কার্যাবলী', 'সুপ্রিম কোর্ট ও বিচার ব্যবস্থার স্বাধীনতা', 'স্থানীয় শাসন কাঠামো'] }] },
    { chapterNumber: 8, chapterName: 'অধ্যায় ৮: বাংলাদেশের গণতন্ত্র ও নির্বাচন', topics: [{ name: 'নির্বাচন কমিশন ও ভোটাধিকার', subTopics: ['গণতন্ত্রের সংজ্ঞা ও মূলনীতি', 'নির্বাচন কমিশনের গঠন ও দায়িত্ব', 'সুষ্ঠু নির্বাচনে রাজনৈতিক দল ও জনগণের ভূমিকা'] }] },
    { chapterNumber: 9, chapterName: 'অধ্যায় ৯: জাতিসংঘ ও বাংলাদেশ', topics: [{ name: 'জাতিসংঘের অঙ্গসংস্থা ও শান্তিরক্ষা মিশন', subTopics: ['জাতিসংঘ প্রতিষ্ঠার পটভূমি', 'ইউনেস্কো, ইউনিসেফ ও বিশ্ব স্বাস্থ্য সংস্থা', 'জাতিসংঘ শান্তিরক্ষা মিশনে বাংলাদেশ সেনাবাহিনীর অবদান'] }] },
    { chapterNumber: 10, chapterName: 'অধ্যায় ১০: টেকসই উন্নয়ন অভীষ্ট (SDG) ও বাংলাদেশের উন্নয়ন', topics: [{ name: 'এসডিজি ১৭টি লক্ষ্য ও সামাজিক অগ্রগতি', subTopics: ['দারিদ্র্য দূরীকরণ ও মানসম্মত শিক্ষা', 'জলবায়ু সুরক্ষায় পদক্ষেপ', 'ডিজিটাল ও স্মার্ট বাংলাদেশের রূপরেখা'] }] }
];

// HSC Bangla 1st Paper (Class 11 & 12)
const hscBangla1 = [
    // গদ্য (Prose)
    { chapterNumber: 1, chapterName: 'গদ্য: অপরিচিতা - রবীন্দ্রনাথ ঠাকুর', topics: [{ name: 'যৌতুকপ্রথা বিরোধী প্রতিবাদ ও কল্যাণীর চরিত্র', subTopics: ['অনুপমের আত্মকথন ও মাতুলনির্ভরতা', 'শম্ভুনাথ সেনের আত্মমর্যাদাবোধ', 'নারীর ক্ষমতায়ন ও আত্মনির্ভরতা'] }] },
    { chapterNumber: 2, chapterName: 'গদ্য: বিলাসী - শরৎচন্দ্র চট্টোপাধ্যায়', topics: [{ name: 'প্রেমের মহিমা ও সমাজ ব্যবস্থার সংকীর্ণতা', subTopics: ['ন্যাড়ার জবানবন্দি', 'মৃত্যুঞ্জয়ের আরোগ্য ও বিলাসীর সেবা', 'জাত-পাতের কুসংস্কার ও নির্মম সমাজ'] }] },
    { chapterNumber: 3, chapterName: 'গদ্য: আমার পথ - কাজী নজরুল ইসলাম', topics: [{ name: 'সত্যের সাধনা ও আত্মবিশ্বাস', subTopics: ['নিজের সত্যকে চেনা', 'ভণ্ডামি ও পরনির্ভরতার অবসান', 'সর্বধর্মীয় সম্প্রীতি ও নির্ভীকচিত্ত'] }] },
    { chapterNumber: 4, chapterName: 'গদ্য: মানব-কল্যাণ - আবুল ফজল', topics: [{ name: 'খয়রাত বনাম মানুষের সার্বিক মর্যাদা', subTopics: ['দানশীলতা ও ভিক্ষুকবৃত্তি', 'রাষ্ট্র ও সমাজের দায়িত্ব', 'মানবমর্যাদা রক্ষা ও প্রকৃত কল্যাণ'] }] },
    { chapterNumber: 5, chapterName: 'গদ্য: মাসি-পিসি - মানিক বন্দ্যোপাধ্যায়', topics: [{ name: 'দরিদ্র বিধবাদের টিকে থাকার লড়াই ও আহ্লাদীকে রক্ষা', subTopics: ['শোষণ ও সমাজের লোলুপ দৃষ্টি', 'মাসি-পিসির যৌথ প্রতিরোধ', 'গ্রামীণ অর্থনীতি ও নারীর শ্রম'] }] },
    { chapterNumber: 6, chapterName: 'গদ্য: বায়ান্নর দিনগুলো - শেখ মুজিবুর রহমান', topics: [{ name: 'ভাষা আন্দোলন ও কারাবন্দী অবস্থায় অনশন', subTopics: ['ঢাকা সেন্ট্রাল জেল ও ফরিদপুর জেলে অনশন', 'মহিউদ্দিন ও শেখ মুজিবের সংকল্প', '২১শে ফেব্রুয়ারির খবর ও মুক্তির মুহূর্ত'] }] },
    { chapterNumber: 7, chapterName: 'গদ্য: রেইনকোট - আখতারুজ্জামান ইলিয়াস', topics: [{ name: '১৯৭১ এর অবরুদ্ধ ঢাকা ও নুরুল হুদার রূপান্তর', subTopics: ['কলেজের পরিবেশ ও মিলিটারি তল্লাশি', 'শহীদ মুক্তিযোদ্ধা মিন্টুর রেইনকোট', 'ভীতু শিক্ষকের বীরত্বপূর্ণ আত্মপ্রকাশ'] }] },
    // কবিতা (Poetry)
    { chapterNumber: 8, chapterName: 'কবিতা: বিভীষণের প্রতি মেঘনাদ - মাইকেল মধুসূদন দত্ত', topics: [{ name: 'স্বদেশপ্রেম বনাম বিশ্বাসঘাতকতা', subTopics: ['নিকুম্ভিলা যজ্ঞাগারে লক্ষণ ও মেঘনাদ', 'কাকা বিভীষণের দলত্যাগ', 'মেঘনাদের তেজস্বী ভাষণ ও দেশপ্রেম'] }] },
    { chapterNumber: 9, chapterName: 'কবিতা: সোনার তরী - রবীন্দ্রনাথ ঠাকুর', topics: [{ name: 'কর্মের অবিনশ্বরতা ও ব্যক্তি মানুষের ক্ষণস্থায়িত্ব', subTopics: ['বর্ষার খরস্রোতা নদী ও শূন্য মাঠ', 'কৃষক ও মাঝির রূপক', 'মহাকালের বুকে কর্মের স্থান'] }] },
    { chapterNumber: 10, chapterName: 'কবিতা: বিদ্রোহী - কাজী নজরুল ইসলাম', topics: [{ name: 'ঔপনিবেশিক শাসনের বিরুদ্ধে বিপ্লব ও মানবমুক্তি', subTopics: ['চির উন্নত মম শির', 'ধ্বংস ও সৃষ্টির যুগলবন্দী', 'উৎপীড়িতের ক্রন্দনরোল থামার প্রত্যয়'] }] },
    { chapterNumber: 11, chapterName: 'কবিতা: প্রতিদান - জসীমউদ্দীন', topics: [{ name: 'ক্ষমা ও ভালোবাসার মাধ্যমে শত্রু জয়', subTopics: ['আঘাতের বিনিময়ে উপকার', 'বিশ্বপ্রেম ও পরম অহিংসা', 'কবির উদার দার্শনিক উপলব্ধি'] }] },
    { chapterNumber: 12, chapterName: 'কবিতা: সুচেতনা - জীবনানন্দ দাশ', topics: [{ name: 'ইতিহাসচেতনা, মানবীয় সংকট ও আশাবাদ', subTopics: ['সুচেতনা তুমি এক দূরতর দ্বীপ', 'পৃথিবীর গভীর গভীরতর অসুখ', 'উজ্জ্বল ভবিষ্যতের প্রত্যাশা'] }] },
    { chapterNumber: 13, chapterName: 'কবিতা: ফেব্রুয়ারি ১৯৬৯ - শামসুর রাহমান', topics: [{ name: 'গণঅভ্যুত্থান ও একুশের চেতনার বিস্তার', subTopics: ['সালাম-বরকতের রক্তের স্মৃতি', 'কৃষ্ণচূড়ার রক্তিম রূপক', 'স্বাধিকার আন্দোলনের বিস্ফোরণ'] }] },
    { chapterNumber: 14, chapterName: 'কবিতা: আমি কিংবদন্তির কথা বলছি - আবু জাফর ওবায়দুল্লাহ', topics: [{ name: 'বাঙালির হাজার বছরের সংগ্রাম ও মুক্তির ঐতিহ্য', subTopics: ['পূর্বপুরুষদের রক্ত ও শ্রম', 'কর্ষিত মাটির শস্য ও কবিতার শক্তি', 'মুক্তির জন্য সশস্ত্র প্রতিরোধ'] }] },
    // সহপাঠ (Novel & Drama)
    { chapterNumber: 15, chapterName: 'সহপাঠ উপন্যাস: লালসালু - সৈয়দ ওয়ালীউল্লাহ', topics: [{ name: 'মজিদের ধর্মব্যবসা, গ্রামীণ কুসংস্কার ও জমিলা', subTopics: ['মহব্বতনগর গ্রামে মজিদের প্রবেশ ও মাজার প্রতিষ্ঠা', 'রহিমার আনুগত্য বনাম জমিলার অবাধ্যতা', 'ভণ্ড ধার্মিকতার স্বরূপ উন্মোচন'] }] },
    { chapterNumber: 16, chapterName: 'সহপাঠ নাটক: সিরাজউদ্দৌলা - সিকান্দার আবু জাফর', topics: [{ name: 'পলাশীর ট্র্যাজেডি, দেশপ্রেম ও বিশ্বাসঘাতকতা', subTopics: ['মিরজাফর ও ঘসেটি বেগমের ষড়যন্ত্র', 'রবার্ট ক্লাইভ ও ইস্ট ইন্ডিয়া কোম্পানি', 'নবাব সিরাজউদ্দৌলার নিঃসঙ্গ দেশপ্রেম', 'মিরমদন ও মোহনলালের বীরত্ব'] }] }
];

// HSC Bangla 2nd Paper (Class 11 & 12)
const hscBangla2 = [
    { chapterNumber: 1, chapterName: 'অধ্যায় ১: বাংলা উচ্চারণের নিয়ম', topics: [{ name: 'অ-ধ্বনি, এ-ধ্বনি, ব/ম-ফলা ও য-ফলা উচ্চারণ', subTopics: ['আদ্য, মধ্য ও অন্ত্য অ-এর সংবৃত ও বিবৃত রূপ', 'ব-ফলা ও ম-ফলার উচ্চারণ বিধি', 'প্রমিত বাংলা উচ্চারণের সূত্রাবলী'] }] },
    { chapterNumber: 2, chapterName: 'অধ্যায় ২: বাংলা বানানের নিয়ম', topics: [{ name: 'বাংলা একাডেমি প্রমিত বাংলা বানানের নিয়ম', subTopics: ['তৎসম ও অতৎসম শব্দের বানানের নিয়ম', 'ই/ঈ ও উ/ঊ এর ব্যবহার', 'ণ-ত্ব ও ষ-ত্ব বিধানের প্রয়োগ', 'বানান শুদ্ধিকরণ'] }] },
    { chapterNumber: 3, chapterName: 'অধ্যায় ৩: ব্যাকরণিক শব্দশ্রেণি', topics: [{ name: 'আট প্রকার ব্যাকরণিক শব্দশ্রেণি ও শ্রেণিবিভাগ', subTopics: ['বিশেষ্য, সর্বনাম ও বিশেষণের প্রকারভেদ', 'ক্রিয়াপদ ও ক্রিয়াজাত শব্দ', 'আবেগ শব্দ ও যোজকের ব্যবহার', 'শব্দশ্রেণি শনাক্তকরণ'] }] },
    { chapterNumber: 4, chapterName: 'অধ্যায় ৪: শব্দ গঠন (উপসর্গ, সমাস ও প্রত্যয়)', topics: [{ name: 'শব্দ নির্মাণের কৌশল ও সমাসের নির্ণয়', subTopics: ['উপসর্গের অর্থবাচকতা ও অর্থদ্যোতকতা', 'ব্যাসবাক্যসহ সমাস নির্ণয়', 'কৃৎপ্রত্যয় ও তদ্ধিত প্রত্যয় যোগে শব্দ গঠন'] }] },
    { chapterNumber: 5, chapterName: 'অধ্যায় ৫: বাক্যতত্ত্ব ও বাক্য রূপান্তর', topics: [{ name: 'বাক্যের সার্থকতা, গঠন ও রূপান্তর', subTopics: ['অর্থগত ও গঠনগত শ্রেণিবিভাগ', 'সরল, জটিল ও যৌগিক বাক্য রূপান্তর', 'অস্তিবাচক ও নেতিবাচক রূপান্তর', 'বাক্য শুদ্ধিকরণ'] }] },
    { chapterNumber: 6, chapterName: 'অধ্যায় ৬: পারিভাষিক শব্দ ও অনুবাদ', topics: [{ name: 'ইংরেজি প্রশাসনিক পরিভাষা ও বঙ্গানুবাদ', subTopics: ['প্রশাসনিক ও দাপ্তরিক পারিভাষিক শব্দ', 'ইংরেজি থেকে বাংলা অনুবাদ কৌশল'] }] },
    { chapterNumber: 7, chapterName: 'অধ্যায় ৭: নির্মিতি অংশ (Writing Composition)', topics: [{ name: 'দিনলিপি, প্রতিবেদন, আবেদনপত্র, সারাংশ ও প্রবন্ধ', subTopics: ['দিনলিপি ও অভিজ্ঞতা লিখন', 'দাপ্তরিক ও সংবাদ প্রতিবেদন', 'আবেদনপত্র ও সারসংক্ষেপ', 'ভাবসম্প্রসারণ ও প্রবন্ধ রচনা'] }] }
];

// HSC English 1st Paper (Class 11 & 12)
const hscEnglish1 = [
    { chapterNumber: 1, chapterName: 'Unit 1: People or Institutions Making History', topics: [{ name: 'Historic Personalities', subTopics: ['The Unforgettable History (Bangabandhu 7th March Speech)', 'Nelson Mandela - From Fighter to President', 'Two Women - Valentina Tereshkova & Kalpana Chawla'] }] },
    { chapterNumber: 2, chapterName: 'Unit 2: Dreams', topics: [{ name: 'Nature of Dreams and Philosophies', subTopics: ['What is a dream?', 'Dream poems (Langston Hughes & D.H. Lawrence)', 'I have a dream (Martin Luther King Jr.)'] }] },
    { chapterNumber: 3, chapterName: 'Unit 3: Lifestyle and Health', topics: [{ name: 'Physical Fitness, Food and Yoga', subTopics: ['Manners and etiquette', 'Food adulteration and public health', 'Health and balanced diet'] }] },
    { chapterNumber: 4, chapterName: 'Unit 4: Youth and Adolescence', topics: [{ name: 'Challenges of Adolescence and Empowerment', subTopics: ['The storm and stress of adolescence', 'Story of Shilpi - Child marriage prevention', 'Adolescents and reproductive health'] }] },
    { chapterNumber: 5, chapterName: 'Unit 5: Youthful Achievers', topics: [{ name: 'Courage, Determination and Discovery', subTopics: ['The journey of a rainbow bird', 'Conquering Mount Everest (Musa Ibrahim)', 'Youth initiatives in social reform'] }] },
    { chapterNumber: 6, chapterName: 'Unit 7: Traffic Education', topics: [{ name: 'Road Safety, Traffic Lights and Rules', subTopics: ['How to be a safe driver', 'The traffic police', 'Filipinos in traffic and urban solutions'] }] },
    { chapterNumber: 7, chapterName: 'Unit 8: Human Rights', topics: [{ name: 'Fundamental Human Rights and Violations', subTopics: ['Are we equal in rights?', 'Out of the trap - Child labor', 'Amerigo - A street child'] }] },
    { chapterNumber: 8, chapterName: 'Unit 9: Peace and Conflict', topics: [{ name: 'War, Non-violence and Conflict Resolution', subTopics: ['Conflicts - causes and types', 'Cruelty of war', 'The peace movement'] }] },
    { chapterNumber: 9, chapterName: 'Unit 12: Environment and Nature', topics: [{ name: 'Climate Crisis, Water and Ecosystems', subTopics: ['Water, water everywhere', 'The Hakaluki Haor', 'Threats to biodiversity'] }] },
    { chapterNumber: 10, chapterName: 'Writing & Summarizing Skills', topics: [{ name: 'Theme Writing, Summarizing and Story Building', subTopics: ['Writing central themes of poems and texts', 'Flow-chart completion', 'Summarizing passages', 'Writing informal letters and graph descriptions'] }] }
];

// HSC English 2nd Paper (Class 11 & 12)
const hscEnglish2 = [
    { chapterNumber: 1, chapterName: 'Topic 1: Prepositions & Phrase Usage', topics: [{ name: 'Appropriate Prepositions and Special Words', subTopics: ['Prepositions of time, place and direction', 'Use of Was born, Have to, Would rather, Had better, Let alone, As soon as'] }] },
    { chapterNumber: 2, chapterName: 'Topic 2: Completing Sentences with Clauses', topics: [{ name: 'Complex Connectors and Conditional Structures', subTopics: ['Conditionals (Zero, 1st, 2nd, 3rd)', 'Lest, As if, As though, It is high time, In order that'] }] },
    { chapterNumber: 3, chapterName: 'Topic 3: Right Form of Verbs', topics: [{ name: 'Subject-Verb Concord and Verbal Nuances', subTopics: ['Tenses and passive forms', 'Non-finite verbs (Gerund, Infinitive, Participle)', 'Modal auxiliaries and subjunctive mood'] }] },
    { chapterNumber: 4, chapterName: 'Topic 4: Narrative Style (Direct & Indirect Speech)', topics: [{ name: 'Rules of Passage Narration', subTopics: ['Reporting assertive, interrogative, imperative, optative and exclamatory speeches', 'Handling dialogue and passage context'] }] },
    { chapterNumber: 5, chapterName: 'Topic 5: Pronoun Referencing & Modifiers', topics: [{ name: 'Clear Reference and Modifiers', subTopics: ['Identifying and correcting faulty pronoun references', 'Pre-modifiers (Noun adjective, Quantifier, Participle, Determiner)', 'Post-modifiers (Appositive, Infinitive phrase, Prepositional phrase)'] }] },
    { chapterNumber: 6, chapterName: 'Topic 6: Sentence Connectors, Synonyms & Antonyms', topics: [{ name: 'Cohesion, Lexical Relations and Punctuation', subTopics: ['Logical sentence connectors', 'Contextual synonyms and antonyms', 'Rules of punctuation marks and capitalization'] }] },
    { chapterNumber: 7, chapterName: 'Topic 7: Writing Composition (Formal Letters & Paragraphs)', topics: [{ name: 'Formal Communication and Essay Paragraphs', subTopics: ['Application to administrative bodies', 'Email writing and official complaints', 'Descriptive, narrative and argument paragraphs'] }] }
];

module.exports = {
    sscBangla1,
    sscBangla2,
    sscEnglish1,
    sscEnglish2,
    sscReligion,
    sscBGS,
    hscBangla1,
    hscBangla2,
    hscEnglish1,
    hscEnglish2
};
