const ebcdicToNum = {
  nnWWn: "00",
  NnwwN: "01",
  nNwwN: "02",
  NNwwn: "03",
  nnWwN: "04",
  NnWwn: "05",
  nNWwn: "06",
  nnwWN: "07",
  NnwWn: "08",
  nNwWn: "09",
  wnNNw: "10",
  WnnnW: "11",
  wNnnW: "12",
  WNnnw: "13",
  wnNnW: "14",
  WnNnw: "15",
  wNNnw: "16",
  wnnNW: "17",
  WnnNw: "18",
  wNnNw: "19",
  nwNNw: "20",
  NwnnW: "21",
  nWnnW: "22",
  NWnnw: "23",
  nwNnW: "24",
  NwNnw: "25",
  nWNnw: "26",
  nwnNW: "27",
  NwnNw: "28",
  nWnNw: "29",
  wwNNn: "30",
  WwnnN: "31",
  wWnnN: "32",
  WWnnn: "33",
  wwNnN: "34",
  WwNnn: "35",
  wWNnn: "36",
  wwnNN: "37",
  WwnNn: "38",
  wWnNn: "39",
  nnWNw: "40",
  NnwnW: "41",
  nNwnW: "42",
  NNwnw: "43",
  nnWnW: "44",
  NnWnw: "45",
  nNWnw: "46",
  nnwNW: "47",
  NnwNw: "48",
  nNwNw: "49",
  wnWNn: "50",
  WnwnN: "51",
  wNwnN: "52",
  WNwnn: "53",
  wnWnN: "54",
  WnWnn: "55",
  wNWnn: "56",
  wnwNN: "57",
  WnwNn: "58",
  wNwNn: "59",
  nwWNn: "60",
  NwwnN: "61",
  nWwnN: "62",
  NWwnn: "63",
  nwWnN: "64",
  NwWnn: "65",
  nWWnn: "66",
  nwwNN: "67",
  NwwNn: "68",
  nWwNn: "69",
  nnNWw: "70",
  NnnwW: "71",
  nNnwW: "72",
  NNnww: "73",
  nnNwW: "74",
  NnNww: "75",
  nNNww: "76",
  nnnWW: "77",
  NnnWw: "78",
  nNnWw: "79",
  wnNWn: "80",
  WnnwN: "81",
  wNnwN: "82",
  WNnwn: "83",
  wnNwN: "84",
  WnNwn: "85",
  wNNwn: "86",
  wnnWN: "87",
  WnnWn: "88",
  wNnWn: "89",
  nwNWn: "90",
  NwnwN: "91",
  nWnwN: "92",
  NWnwn: "93",
  nwNwN: "94",
  NwNwn: "95",
  nWNwn: "96",
  nwnWN: "97",
  NwnWn: "98",
  nWnWn: "99",
};

function decodeCodBar(codBarStr, dict) {
  const slices = codBarStr.match(/.{1,5}/g);
  let decoded = "";

  for (slice of slices) {
    if (dict[slice]) {
      decoded += dict[slice];
    } else {
      console.log("Não reconhecido: ", slice);
    }
  }

  return decoded;
}

const codBar =
  "NWnnwnNnWwWnnnWnnWWnnnWWnnnWWnnnWWnwnNNwnnWWnnNwwNWnNwnnwWNnNwNwnnnWWnnnNWwnnWWnNnwwNNnwnWnNwwNnWnnWNwWnnnwNNw";

const decodedBarNumber = decodeCodBar(codBar, ebcdicToNum);

console.log("Número decodado: ", decodedBarNumber);