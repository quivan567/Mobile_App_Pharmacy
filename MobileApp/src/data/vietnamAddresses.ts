/**
 * Vietnam Address Data
 * Simplified version with major provinces/cities
 * For production, consider using a full dataset or API
 */

export interface Province {
  code: string;
  name: string;
  districts: District[];
}

export interface District {
  code: string;
  name: string;
  wards: Ward[];
}

export interface Ward {
  code: string;
  name: string;
}

export const vietnamAddresses: Province[] = [
  {
    code: '01',
    name: 'Hà Nội',
    districts: [
      {
        code: '001',
        name: 'Quận Ba Đình',
        wards: [
          { code: '00001', name: 'Phường Phúc Xá' },
          { code: '00004', name: 'Phường Trúc Bạch' },
          { code: '00006', name: 'Phường Vĩnh Phúc' },
          { code: '00007', name: 'Phường Cống Vị' },
          { code: '00008', name: 'Phường Liễu Giai' },
          { code: '00010', name: 'Phường Nguyễn Trung Trực' },
          { code: '00013', name: 'Phường Quán Thánh' },
          { code: '00016', name: 'Phường Ngọc Hà' },
          { code: '00019', name: 'Phường Điện Biên' },
          { code: '00022', name: 'Phường Đội Cấn' },
          { code: '00025', name: 'Phường Ngọc Khánh' },
          { code: '00028', name: 'Phường Kim Mã' },
          { code: '00031', name: 'Phường Giảng Võ' },
          { code: '00034', name: 'Phường Thành Công' },
        ],
      },
      {
        code: '002',
        name: 'Quận Hoàn Kiếm',
        wards: [
          { code: '00037', name: 'Phường Phúc Tân' },
          { code: '00040', name: 'Phường Đồng Xuân' },
          { code: '00043', name: 'Phường Hàng Mã' },
          { code: '00046', name: 'Phường Hàng Buồm' },
          { code: '00049', name: 'Phường Hàng Đào' },
          { code: '00052', name: 'Phường Hàng Bồ' },
          { code: '00055', name: 'Phường Cửa Đông' },
          { code: '00058', name: 'Phường Lý Thái Tổ' },
          { code: '00061', name: 'Phường Hàng Bạc' },
          { code: '00064', name: 'Phường Hàng Gai' },
          { code: '00067', name: 'Phường Chương Dương Độ' },
          { code: '00070', name: 'Phường Hàng Trống' },
          { code: '00073', name: 'Phường Cửa Nam' },
          { code: '00076', name: 'Phường Hàng Bông' },
          { code: '00079', name: 'Phường Tràng Tiền' },
          { code: '00082', name: 'Phường Trần Hưng Đạo' },
          { code: '00085', name: 'Phường Phan Chu Trinh' },
          { code: '00088', name: 'Phường Hàng Bài' },
        ],
      },
      {
        code: '003',
        name: 'Quận Tây Hồ',
        wards: [
          { code: '00091', name: 'Phường Phú Thượng' },
          { code: '00094', name: 'Phường Nhật Tân' },
          { code: '00097', name: 'Phường Tứ Liên' },
          { code: '00100', name: 'Phường Quảng An' },
          { code: '00103', name: 'Phường Xuân La' },
          { code: '00106', name: 'Phường Yên Phụ' },
          { code: '00109', name: 'Phường Bưởi' },
          { code: '00112', name: 'Phường Thụy Khuê' },
        ],
      },
      {
        code: '004',
        name: 'Quận Long Biên',
        wards: [
          { code: '00115', name: 'Phường Thượng Thanh' },
          { code: '00118', name: 'Phường Ngọc Thụy' },
          { code: '00121', name: 'Phường Giang Biên' },
          { code: '00124', name: 'Phường Đức Giang' },
          { code: '00127', name: 'Phường Việt Hưng' },
          { code: '00130', name: 'Phường Gia Thụy' },
          { code: '00133', name: 'Phường Ngọc Lâm' },
          { code: '00136', name: 'Phường Phúc Lợi' },
          { code: '00139', name: 'Phường Bồ Đề' },
          { code: '00142', name: 'Phường Sài Đồng' },
          { code: '00145', name: 'Phường Long Biên' },
          { code: '00148', name: 'Phường Thạch Bàn' },
          { code: '00151', name: 'Phường Phúc Đồng' },
          { code: '00154', name: 'Phường Cự Khối' },
        ],
      },
      {
        code: '005',
        name: 'Quận Cầu Giấy',
        wards: [
          { code: '00157', name: 'Phường Nghĩa Đô' },
          { code: '00160', name: 'Phường Nghĩa Tân' },
          { code: '00163', name: 'Phường Mai Dịch' },
          { code: '00166', name: 'Phường Dịch Vọng' },
          { code: '00167', name: 'Phường Dịch Vọng Hậu' },
          { code: '00169', name: 'Phường Quan Hoa' },
          { code: '00172', name: 'Phường Yên Hòa' },
          { code: '00175', name: 'Phường Trung Hòa' },
        ],
      },
      {
        code: '006',
        name: 'Quận Đống Đa',
        wards: [
          { code: '00178', name: 'Phường Cát Linh' },
          { code: '00181', name: 'Phường Văn Miếu' },
          { code: '00184', name: 'Phường Quốc Tử Giám' },
          { code: '00187', name: 'Phường Láng Thượng' },
          { code: '00190', name: 'Phường Ô Chợ Dừa' },
          { code: '00193', name: 'Phường Văn Chương' },
          { code: '00196', name: 'Phường Hàng Bột' },
          { code: '00199', name: 'Phường Láng Hạ' },
          { code: '00202', name: 'Phường Khâm Thiên' },
          { code: '00205', name: 'Phường Thổ Quan' },
          { code: '00208', name: 'Phường Nam Đồng' },
          { code: '00211', name: 'Phường Trung Phụng' },
          { code: '00214', name: 'Phường Quang Trung' },
          { code: '00217', name: 'Phường Trung Liệt' },
          { code: '00220', name: 'Phường Phương Liên' },
          { code: '00223', name: 'Phường Thịnh Quang' },
          { code: '00226', name: 'Phường Trung Tự' },
          { code: '00229', name: 'Phường Kim Liên' },
          { code: '00232', name: 'Phường Phương Mai' },
          { code: '00235', name: 'Phường Ngã Tư Sở' },
          { code: '00238', name: 'Phường Khương Thượng' },
        ],
      },
      {
        code: '007',
        name: 'Quận Hai Bà Trưng',
        wards: [
          { code: '00241', name: 'Phường Nguyễn Du' },
          { code: '00244', name: 'Phường Bạch Đằng' },
          { code: '00247', name: 'Phường Phạm Đình Hổ' },
          { code: '00256', name: 'Phường Lê Đại Hành' },
          { code: '00259', name: 'Phường Đồng Nhân' },
          { code: '00262', name: 'Phường Phố Huế' },
          { code: '00265', name: 'Phường Đống Mác' },
          { code: '00268', name: 'Phường Thanh Lương' },
          { code: '00271', name: 'Phường Thanh Nhàn' },
          { code: '00274', name: 'Phường Cầu Dền' },
          { code: '00277', name: 'Phường Bách Khoa' },
          { code: '00280', name: 'Phường Đồng Tâm' },
          { code: '00283', name: 'Phường Vĩnh Tuy' },
          { code: '00286', name: 'Phường Bạch Mai' },
          { code: '00289', name: 'Phường Quỳnh Mai' },
          { code: '00292', name: 'Phường Quỳnh Lôi' },
          { code: '00295', name: 'Phường Minh Khai' },
          { code: '00298', name: 'Phường Trương Định' },
        ],
      },
      {
        code: '008',
        name: 'Quận Hoàng Mai',
        wards: [
          { code: '00301', name: 'Phường Thanh Trì' },
          { code: '00304', name: 'Phường Vĩnh Hưng' },
          { code: '00307', name: 'Phường Định Công' },
          { code: '00310', name: 'Phường Mai Động' },
          { code: '00313', name: 'Phường Tương Mai' },
          { code: '00316', name: 'Phường Đại Kim' },
          { code: '00319', name: 'Phường Tân Mai' },
          { code: '00322', name: 'Phường Hoàng Văn Thụ' },
          { code: '00325', name: 'Phường Giáp Bát' },
          { code: '00328', name: 'Phường Lĩnh Nam' },
          { code: '00331', name: 'Phường Vĩnh Hưng' },
          { code: '00334', name: 'Phường Trần Phú' },
          { code: '00337', name: 'Phường Hoàng Liệt' },
          { code: '00340', name: 'Phường Yên Sở' },
        ],
      },
    ],
  },
  {
    code: '79',
    name: 'Hồ Chí Minh',
    districts: [
      {
        code: '760',
        name: 'Quận 1',
        wards: [
          { code: '26794', name: 'Phường Bến Nghé' },
          { code: '26797', name: 'Phường Đa Kao' },
          { code: '26800', name: 'Phường Bến Thành' },
          { code: '26803', name: 'Phường Nguyễn Thái Bình' },
          { code: '26806', name: 'Phường Phạm Ngũ Lão' },
          { code: '26809', name: 'Phường Cầu Ông Lãnh' },
          { code: '26812', name: 'Phường Cô Giang' },
          { code: '26815', name: 'Phường Nguyễn Cư Trinh' },
          { code: '26818', name: 'Phường Cầu Kho' },
        ],
      },
      {
        code: '761',
        name: 'Quận 3',
        wards: [
          { code: '26821', name: 'Phường Võ Thị Sáu' },
          { code: '26824', name: 'Phường Đa Kao' },
          { code: '26827', name: 'Phường Võ Văn Tần' },
          { code: '26830', name: 'Phường Nguyễn Thị Minh Khai' },
          { code: '26833', name: 'Phường Nguyễn Đình Chiểu' },
          { code: '26836', name: 'Phường Đa Kao' },
          { code: '26839', name: 'Phường Phạm Ngũ Lão' },
          { code: '26842', name: 'Phường Cầu Ông Lãnh' },
          { code: '26845', name: 'Phường Cô Giang' },
          { code: '26848', name: 'Phường Nguyễn Cư Trinh' },
          { code: '26851', name: 'Phường Cầu Kho' },
        ],
      },
      {
        code: '762',
        name: 'Quận 4',
        wards: [
          { code: '26854', name: 'Phường 1' },
          { code: '26857', name: 'Phường 2' },
          { code: '26860', name: 'Phường 3' },
          { code: '26863', name: 'Phường 4' },
          { code: '26866', name: 'Phường 5' },
          { code: '26869', name: 'Phường 6' },
          { code: '26872', name: 'Phường 8' },
          { code: '26875', name: 'Phường 9' },
          { code: '26878', name: 'Phường 10' },
          { code: '26881', name: 'Phường 12' },
          { code: '26884', name: 'Phường 13' },
          { code: '26887', name: 'Phường 14' },
          { code: '26890', name: 'Phường 15' },
          { code: '26893', name: 'Phường 16' },
          { code: '26896', name: 'Phường 18' },
        ],
      },
      {
        code: '763',
        name: 'Quận 5',
        wards: [
          { code: '26899', name: 'Phường 1' },
          { code: '26902', name: 'Phường 2' },
          { code: '26905', name: 'Phường 3' },
          { code: '26908', name: 'Phường 4' },
          { code: '26911', name: 'Phường 5' },
          { code: '26914', name: 'Phường 6' },
          { code: '26917', name: 'Phường 7' },
          { code: '26920', name: 'Phường 8' },
          { code: '26923', name: 'Phường 9' },
          { code: '26926', name: 'Phường 10' },
          { code: '26929', name: 'Phường 11' },
          { code: '26932', name: 'Phường 12' },
          { code: '26935', name: 'Phường 13' },
          { code: '26938', name: 'Phường 14' },
        ],
      },
      {
        code: '764',
        name: 'Quận 6',
        wards: [
          { code: '26941', name: 'Phường 1' },
          { code: '26944', name: 'Phường 2' },
          { code: '26947', name: 'Phường 3' },
          { code: '26950', name: 'Phường 4' },
          { code: '26953', name: 'Phường 5' },
          { code: '26956', name: 'Phường 6' },
          { code: '26959', name: 'Phường 7' },
          { code: '26962', name: 'Phường 8' },
          { code: '26965', name: 'Phường 9' },
          { code: '26968', name: 'Phường 10' },
          { code: '26971', name: 'Phường 11' },
          { code: '26974', name: 'Phường 12' },
          { code: '26977', name: 'Phường 13' },
          { code: '26980', name: 'Phường 14' },
        ],
      },
      {
        code: '765',
        name: 'Quận 7',
        wards: [
          { code: '26983', name: 'Phường Tân Thuận Đông' },
          { code: '26986', name: 'Phường Tân Thuận Tây' },
          { code: '26989', name: 'Phường Tân Kiểng' },
          { code: '26992', name: 'Phường Tân Hưng' },
          { code: '26995', name: 'Phường Bình Thuận' },
          { code: '26998', name: 'Phường Tân Quy' },
          { code: '27001', name: 'Phường Phú Thuận' },
          { code: '27004', name: 'Phường Tân Phú' },
          { code: '27007', name: 'Phường Tân Phong' },
          { code: '27010', name: 'Phường Phú Mỹ' },
        ],
      },
      {
        code: '766',
        name: 'Quận 8',
        wards: [
          { code: '27013', name: 'Phường 1' },
          { code: '27016', name: 'Phường 2' },
          { code: '27019', name: 'Phường 3' },
          { code: '27022', name: 'Phường 4' },
          { code: '27025', name: 'Phường 5' },
          { code: '27028', name: 'Phường 6' },
          { code: '27031', name: 'Phường 7' },
          { code: '27034', name: 'Phường 8' },
          { code: '27037', name: 'Phường 9' },
          { code: '27040', name: 'Phường 10' },
          { code: '27043', name: 'Phường 11' },
          { code: '27046', name: 'Phường 12' },
          { code: '27049', name: 'Phường 13' },
          { code: '27052', name: 'Phường 14' },
          { code: '27055', name: 'Phường 15' },
          { code: '27058', name: 'Phường 16' },
        ],
      },
      {
        code: '767',
        name: 'Quận Bình Thạnh',
        wards: [
          { code: '27061', name: 'Phường 1' },
          { code: '27064', name: 'Phường 2' },
          { code: '27067', name: 'Phường 3' },
          { code: '27070', name: 'Phường 5' },
          { code: '27073', name: 'Phường 6' },
          { code: '27076', name: 'Phường 7' },
          { code: '27079', name: 'Phường 11' },
          { code: '27082', name: 'Phường 12' },
          { code: '27085', name: 'Phường 13' },
          { code: '27088', name: 'Phường 14' },
          { code: '27091', name: 'Phường 15' },
          { code: '27094', name: 'Phường 17' },
          { code: '27097', name: 'Phường 19' },
          { code: '27100', name: 'Phường 21' },
          { code: '27103', name: 'Phường 22' },
          { code: '27106', name: 'Phường 24' },
          { code: '27109', name: 'Phường 25' },
          { code: '27112', name: 'Phường 26' },
          { code: '27115', name: 'Phường 27' },
          { code: '27118', name: 'Phường 28' },
        ],
      },
      {
        code: '768',
        name: 'Quận Tân Bình',
        wards: [
          { code: '27121', name: 'Phường 1' },
          { code: '27124', name: 'Phường 2' },
          { code: '27127', name: 'Phường 3' },
          { code: '27130', name: 'Phường 4' },
          { code: '27133', name: 'Phường 5' },
          { code: '27136', name: 'Phường 6' },
          { code: '27139', name: 'Phường 7' },
          { code: '27142', name: 'Phường 8' },
          { code: '27145', name: 'Phường 9' },
          { code: '27148', name: 'Phường 10' },
          { code: '27151', name: 'Phường 11' },
          { code: '27154', name: 'Phường 12' },
          { code: '27157', name: 'Phường 13' },
          { code: '27160', name: 'Phường 14' },
          { code: '27163', name: 'Phường 15' },
        ],
      },
      {
        code: '769',
        name: 'Quận Tân Phú',
        wards: [
          { code: '27166', name: 'Phường Tân Sơn Nhì' },
          { code: '27169', name: 'Phường Tây Thạnh' },
          { code: '27172', name: 'Phường Sơn Kỳ' },
          { code: '27175', name: 'Phường Tân Quý' },
          { code: '27178', name: 'Phường Tân Thành' },
          { code: '27181', name: 'Phường Phú Thọ Hòa' },
          { code: '27184', name: 'Phường Phú Thạnh' },
          { code: '27187', name: 'Phường Phú Trung' },
          { code: '27190', name: 'Phường Hòa Thạnh' },
          { code: '27193', name: 'Phường Hiệp Tân' },
          { code: '27196', name: 'Phường Tân Thới Hòa' },
        ],
      },
      {
        code: '770',
        name: 'Quận Phú Nhuận',
        wards: [
          { code: '27199', name: 'Phường 1' },
          { code: '27202', name: 'Phường 2' },
          { code: '27205', name: 'Phường 3' },
          { code: '27208', name: 'Phường 4' },
          { code: '27211', name: 'Phường 5' },
          { code: '27214', name: 'Phường 7' },
          { code: '27217', name: 'Phường 8' },
          { code: '27220', name: 'Phường 9' },
          { code: '27223', name: 'Phường 10' },
          { code: '27226', name: 'Phường 11' },
          { code: '27229', name: 'Phường 12' },
          { code: '27232', name: 'Phường 13' },
          { code: '27235', name: 'Phường 14' },
          { code: '27238', name: 'Phường 15' },
        ],
      },
      {
        code: '771',
        name: 'Quận Gò Vấp',
        wards: [
          { code: '27241', name: 'Phường 1' },
          { code: '27244', name: 'Phường 3' },
          { code: '27247', name: 'Phường 4' },
          { code: '27250', name: 'Phường 5' },
          { code: '27253', name: 'Phường 6' },
          { code: '27256', name: 'Phường 7' },
          { code: '27259', name: 'Phường 8' },
          { code: '27262', name: 'Phường 9' },
          { code: '27265', name: 'Phường 10' },
          { code: '27268', name: 'Phường 11' },
          { code: '27271', name: 'Phường 12' },
          { code: '27274', name: 'Phường 13' },
          { code: '27277', name: 'Phường 14' },
          { code: '27280', name: 'Phường 15' },
          { code: '27283', name: 'Phường 16' },
          { code: '27286', name: 'Phường 17' },
        ],
      },
    ],
  },
  {
    code: '48',
    name: 'Đà Nẵng',
    districts: [
      {
        code: '490',
        name: 'Quận Hải Châu',
        wards: [
          { code: '20305', name: 'Phường Thanh Bình' },
          { code: '20308', name: 'Phường Thuận Phước' },
          { code: '20311', name: 'Phường Thạch Thang' },
          { code: '20314', name: 'Phường Hải Châu I' },
          { code: '20317', name: 'Phường Hải Châu II' },
          { code: '20320', name: 'Phường Phước Ninh' },
          { code: '20323', name: 'Phường Hòa Thuận Đông' },
          { code: '20326', name: 'Phường Hòa Thuận Tây' },
          { code: '20329', name: 'Phường Nam Dương' },
          { code: '20332', name: 'Phường Bình Hiên' },
          { code: '20335', name: 'Phường Bình Thuận' },
          { code: '20338', name: 'Phường Hòa Cường Bắc' },
          { code: '20341', name: 'Phường Hòa Cường Nam' },
        ],
      },
      {
        code: '491',
        name: 'Quận Thanh Khê',
        wards: [
          { code: '20344', name: 'Phường Thạch Thang' },
          { code: '20347', name: 'Phường Thanh Khê Đông' },
          { code: '20350', name: 'Phường Thanh Khê Tây' },
          { code: '20353', name: 'Phường Xuân Hà' },
          { code: '20356', name: 'Phường Tân Chính' },
          { code: '20359', name: 'Phường Chính Gián' },
          { code: '20362', name: 'Phường Vĩnh Trung' },
          { code: '20365', name: 'Phường Thạc Gián' },
          { code: '20368', name: 'Phường An Khê' },
          { code: '20371', name: 'Phường Hòa Khê' },
        ],
      },
      {
        code: '492',
        name: 'Quận Sơn Trà',
        wards: [
          { code: '20374', name: 'Phường Thanh Khê Đông' },
          { code: '20375', name: 'Phường Thanh Khê Tây' },
          { code: '20376', name: 'Phường Xuân Hà' },
          { code: '20377', name: 'Phường Tân Chính' },
          { code: '20378', name: 'Phường Chính Gián' },
          { code: '20379', name: 'Phường Vĩnh Trung' },
          { code: '20380', name: 'Phường Thạc Gián' },
          { code: '20381', name: 'Phường An Khê' },
          { code: '20382', name: 'Phường Hòa Khê' },
          { code: '20383', name: 'Phường Thanh Bình' },
          { code: '20384', name: 'Phường Thuận Phước' },
          { code: '20385', name: 'Phường Thạch Thang' },
          { code: '20386', name: 'Phường Hải Châu I' },
          { code: '20387', name: 'Phường Hải Châu II' },
          { code: '20388', name: 'Phường Phước Ninh' },
        ],
      },
    ],
  },
  {
    code: '92',
    name: 'Cần Thơ',
    districts: [
      {
        code: '916',
        name: 'Quận Ninh Kiều',
        wards: [
          { code: '31102', name: 'Phường An Hòa' },
          { code: '31105', name: 'Phường An Khánh' },
          { code: '31108', name: 'Phường An Lạc' },
          { code: '31111', name: 'Phường An Nghiệp' },
          { code: '31114', name: 'Phường An Phú' },
          { code: '31117', name: 'Phường An Thạnh' },
          { code: '31120', name: 'Phường Cái Khế' },
          { code: '31123', name: 'Phường Hưng Lợi' },
          { code: '31126', name: 'Phường Tân An' },
          { code: '31129', name: 'Phường Thới Bình' },
          { code: '31132', name: 'Phường Xuân Khánh' },
        ],
      },
      {
        code: '917',
        name: 'Quận Ô Môn',
        wards: [
          { code: '31135', name: 'Phường Châu Văn Liêm' },
          { code: '31138', name: 'Phường Long Hưng' },
          { code: '31141', name: 'Phường Phước Thới' },
          { code: '31144', name: 'Phường Thới Hòa' },
          { code: '31147', name: 'Phường Thới Long' },
          { code: '31150', name: 'Phường Thới Thạnh' },
        ],
      },
    ],
  },
  {
    code: '31',
    name: 'Hải Phòng',
    districts: [
      {
        code: '311',
        name: 'Quận Hồng Bàng',
        wards: [
          { code: '11515', name: 'Phường Minh Khai' },
          { code: '11518', name: 'Phường Trại Chuối' },
          { code: '11521', name: 'Phường Hoàng Văn Thụ' },
          { code: '11524', name: 'Phường Phan Bội Châu' },
          { code: '11527', name: 'Phường Máy Chai' },
          { code: '11530', name: 'Phường Máy Tơ' },
          { code: '11533', name: 'Phường Vạn Mỹ' },
          { code: '11536', name: 'Phường Cầu Tre' },
          { code: '11539', name: 'Phường Lạch Tray' },
          { code: '11542', name: 'Phường Đông Khê' },
          { code: '11545', name: 'Phường Cầu Đất' },
          { code: '11548', name: 'Phường Lê Lợi' },
          { code: '11551', name: 'Phường Đằng Giang' },
          { code: '11554', name: 'Phường Lạch Tray' },
        ],
      },
      {
        code: '312',
        name: 'Quận Ngô Quyền',
        wards: [
          { code: '11557', name: 'Phường Cát Dài' },
          { code: '11560', name: 'Phường An Biên' },
          { code: '11563', name: 'Phường Lam Sơn' },
          { code: '11566', name: 'Phường An Dương' },
          { code: '11569', name: 'Phường Trần Nguyên Hãn' },
          { code: '11572', name: 'Phường Hồ Nam' },
          { code: '11575', name: 'Phường Trại Cau' },
          { code: '11578', name: 'Phường Dư Hàng' },
          { code: '11581', name: 'Phường Hàng Kênh' },
          { code: '11584', name: 'Phường Đông Hải' },
          { code: '11587', name: 'Phường Niệm Nghĩa' },
          { code: '11590', name: 'Phường Nghĩa Xá' },
          { code: '11593', name: 'Phường Dư Hàng Kênh' },
          { code: '11596', name: 'Phường Kênh Dương' },
          { code: '11599', name: 'Phường Vĩnh Niệm' },
        ],
      },
    ],
  },
  {
    code: '36',
    name: 'Thái Nguyên',
    districts: [
      {
        code: '360',
        name: 'Thành phố Thái Nguyên',
        wards: [
          { code: '13960', name: 'Phường Hoàng Văn Thụ' },
          { code: '13963', name: 'Phường Tân Thịnh' },
          { code: '13966', name: 'Phường Đồng Quang' },
          { code: '13969', name: 'Phường Phan Đình Phùng' },
          { code: '13972', name: 'Phường Tân Lập' },
          { code: '13975', name: 'Phường Quang Trung' },
          { code: '13978', name: 'Phường Phú Xá' },
          { code: '13981', name: 'Phường Thịnh Đán' },
          { code: '13984', name: 'Phường Đồng Bẩm' },
          { code: '13987', name: 'Phường Tân Long' },
          { code: '13990', name: 'Phường Tích Lương' },
          { code: '13993', name: 'Phường Tân Thành' },
          { code: '13996', name: 'Phường Trưng Vương' },
          { code: '13999', name: 'Phường Hương Sơn' },
          { code: '14002', name: 'Phường Trung Thành' },
          { code: '14005', name: 'Phường Tân Hương' },
          { code: '14008', name: 'Phường Tân Long' },
        ],
      },
    ],
  },
  {
    code: '34',
    name: 'Thái Bình',
    districts: [
      {
        code: '340',
        name: 'Thành phố Thái Bình',
        wards: [
          { code: '13030', name: 'Phường Lê Hồng Phong' },
          { code: '13033', name: 'Phường Bồ Xuyên' },
          { code: '13036', name: 'Phường Đề Thám' },
          { code: '13039', name: 'Phường Kỳ Bá' },
          { code: '13042', name: 'Phường Quang Trung' },
          { code: '13045', name: 'Phường Phú Khánh' },
          { code: '13048', name: 'Phường Tiền Phong' },
          { code: '13051', name: 'Phường Trần Hưng Đạo' },
          { code: '13054', name: 'Phường Trần Lãm' },
          { code: '13057', name: 'Phường Đông Hòa' },
          { code: '13060', name: 'Xã Đông Mỹ' },
          { code: '13063', name: 'Xã Đông Thọ' },
          { code: '13066', name: 'Xã Vũ Đông' },
          { code: '13069', name: 'Xã Vũ Lạc' },
          { code: '13072', name: 'Xã Tân Bình' },
        ],
      },
    ],
  },
  {
    code: '38',
    name: 'Bắc Giang',
    districts: [
      {
        code: '380',
        name: 'Thành phố Bắc Giang',
        wards: [
          { code: '14773', name: 'Phường Thọ Xương' },
          { code: '14776', name: 'Phường Trần Nguyên Hãn' },
          { code: '14779', name: 'Phường Ngô Quyền' },
          { code: '14782', name: 'Phường Hoàng Văn Thụ' },
          { code: '14785', name: 'Phường Trần Phú' },
          { code: '14788', name: 'Phường Mỹ Độ' },
          { code: '14791', name: 'Phường Lê Lợi' },
          { code: '14794', name: 'Xã Song Mai' },
          { code: '14797', name: 'Xã Dĩnh Kế' },
          { code: '14800', name: 'Xã Dĩnh Trì' },
          { code: '14803', name: 'Xã Tân Mỹ' },
          { code: '14806', name: 'Xã Đồng Sơn' },
          { code: '14809', name: 'Xã Tân Tiến' },
          { code: '14812', name: 'Xã Song Khê' },
        ],
      },
    ],
  },
  {
    code: '35',
    name: 'Hải Dương',
    districts: [
      {
        code: '350',
        name: 'Thành phố Hải Dương',
        wards: [
          { code: '13561', name: 'Phường Thanh Bình' },
          { code: '13564', name: 'Phường Bình Hàn' },
          { code: '13567', name: 'Phường Ngọc Châu' },
          { code: '13568', name: 'Phường Nhị Châu' },
          { code: '13570', name: 'Phường Quang Trung' },
          { code: '13573', name: 'Phường Nguyễn Trãi' },
          { code: '13576', name: 'Phường Phạm Ngũ Lão' },
          { code: '13579', name: 'Phường Trần Hưng Đạo' },
          { code: '13582', name: 'Phường Trần Phú' },
          { code: '13585', name: 'Phường Thanh Bình' },
          { code: '13588', name: 'Phường Tân Bình' },
          { code: '13591', name: 'Phường Lê Thanh Nghị' },
          { code: '13594', name: 'Phường Hải Tân' },
          { code: '13597', name: 'Phường Tứ Minh' },
          { code: '13600', name: 'Phường Việt Hòa' },
        ],
      },
    ],
  },
  {
    code: '30',
    name: 'Hà Nam',
    districts: [
      {
        code: '300',
        name: 'Thành phố Phủ Lý',
        wards: [
          { code: '11170', name: 'Phường Lam Hạ' },
          { code: '11173', name: 'Phường Phù Vân' },
          { code: '11176', name: 'Phường Liêm Chính' },
          { code: '11179', name: 'Xã Liêm Chung' },
          { code: '11182', name: 'Phường Thanh Châu' },
          { code: '11185', name: 'Phường Châu Sơn' },
          { code: '11188', name: 'Xã Tiên Tân' },
          { code: '11191', name: 'Xã Tiên Hiệp' },
          { code: '11194', name: 'Xã Tiên Hải' },
          { code: '11197', name: 'Xã Tiên Hoàng' },
          { code: '11200', name: 'Xã Tiên Ngoại' },
          { code: '11203', name: 'Xã Tiên Nội' },
          { code: '11206', name: 'Xã Liêm Tuyền' },
          { code: '11209', name: 'Xã Liêm Tiết' },
          { code: '11212', name: 'Phường Thanh Tuyền' },
          { code: '11215', name: 'Xã Đinh Xá' },
          { code: '11218', name: 'Xã Trịnh Xá' },
        ],
      },
    ],
  },
];

/**
 * Note: This is a simplified dataset with major provinces/cities.
 * For production, consider:
 * 1. Using a full dataset from Vietnam Address API
 * 2. Loading data from backend API
 * 3. Using a third-party service like Goong Maps API
 */

/**
 * Get all provinces
 */
export const getProvinces = (): Array<{ code: string; name: string }> => {
  return vietnamAddresses.map((p) => ({ code: p.code, name: p.name }));
};

/**
 * Get districts by province code
 */
export const getDistricts = (provinceCode: string): Array<{ code: string; name: string }> => {
  const province = vietnamAddresses.find((p) => p.code === provinceCode);
  if (!province) return [];
  return province.districts.map((d) => ({ code: d.code, name: d.name }));
};

/**
 * Get wards by province code and district code
 */
export const getWards = (provinceCode: string, districtCode: string): Array<{ code: string; name: string }> => {
  const province = vietnamAddresses.find((p) => p.code === provinceCode);
  if (!province) return [];
  const district = province.districts.find((d) => d.code === districtCode);
  if (!district) return [];
  return district.wards.map((w) => ({ code: w.code, name: w.name }));
};

/**
 * Find province by name (fuzzy search)
 */
export const findProvinceByName = (name: string): { code: string; name: string } | null => {
  const normalizedName = name.toLowerCase().trim();
  const province = vietnamAddresses.find(
    (p) =>
      p.name.toLowerCase() === normalizedName ||
      p.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(p.name.toLowerCase())
  );
  return province ? { code: province.code, name: province.name } : null;
};

/**
 * Find district by name (fuzzy search within province)
 */
export const findDistrictByName = (
  provinceCode: string,
  districtName: string
): { code: string; name: string } | null => {
  const province = vietnamAddresses.find((p) => p.code === provinceCode);
  if (!province) return null;
  const normalizedName = districtName.toLowerCase().trim();
  const district = province.districts.find(
    (d) =>
      d.name.toLowerCase() === normalizedName ||
      d.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(d.name.toLowerCase())
  );
  return district ? { code: district.code, name: district.name } : null;
};

/**
 * Find ward by name (fuzzy search within district)
 */
export const findWardByName = (
  provinceCode: string,
  districtCode: string,
  wardName: string
): { code: string; name: string } | null => {
  const province = vietnamAddresses.find((p) => p.code === provinceCode);
  if (!province) return null;
  const district = province.districts.find((d) => d.code === districtCode);
  if (!district) return null;
  const normalizedName = wardName.toLowerCase().trim();
  const ward = district.wards.find(
    (w) =>
      w.name.toLowerCase() === normalizedName ||
      w.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(w.name.toLowerCase())
  );
  return ward ? { code: ward.code, name: ward.name } : null;
};

